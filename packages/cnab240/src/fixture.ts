type Field = { start: number; end: number; value: string };

function record(fields: Field[]): string {
  const chars = Array.from({ length: 240 }, () => " ");
  for (const { start, end, value } of fields) {
    const width = end - start + 1;
    const normalized = value.slice(0, width).padEnd(width, " ");
    for (let index = 0; index < width; index += 1) chars[start - 1 + index] = normalized[index] ?? " ";
  }
  return chars.join("");
}

function numeric(value: string | number, width: number): string {
  return String(value).padStart(width, "0");
}

export function buildSyntheticCnab(options: {
  bankCode: "341" | "748";
  branch?: string;
  account?: string;
  accountDigit?: string;
  transactions: Array<{
    accountingDate: string;
    eventDate?: string;
    direction: "D" | "C";
    amountCents: number;
    category?: string;
    historyCode?: string;
    description: string;
    document?: string;
  }>;
}): Uint8Array {
  const branch = options.branch ?? "1234";
  const account = options.account ?? "56789";
  const accountDigit = options.accountDigit ?? "0";
  const isItau = options.bankCode === "341";
  const accountFields = isItau
    ? [
        { start: 54, end: 57, value: numeric(branch, 4) },
        { start: 66, end: 70, value: numeric(account, 5) },
        { start: 71, end: 71, value: accountDigit },
      ]
    : [
        { start: 53, end: 57, value: numeric(branch, 5) },
        { start: 59, end: 70, value: numeric(account, 12) },
        { start: 71, end: 71, value: accountDigit },
      ];

  const header = record([
    { start: 1, end: 3, value: options.bankCode },
    { start: 4, end: 7, value: "0000" },
    { start: 8, end: 8, value: "0" },
    { start: 164, end: 166, value: "050" },
  ]);
  const lotHeader = record([
    { start: 1, end: 3, value: options.bankCode },
    { start: 4, end: 7, value: "0001" },
    { start: 8, end: 8, value: "1" },
    { start: 9, end: 9, value: "E" },
    { start: 10, end: 11, value: "04" },
    { start: 14, end: 16, value: isItau ? "031" : "033" },
    ...accountFields,
  ]);
  const details = options.transactions.map((transaction, index) => record([
    { start: 1, end: 3, value: options.bankCode },
    { start: 4, end: 7, value: "0001" },
    { start: 8, end: 8, value: "3" },
    { start: 9, end: 13, value: numeric(index + 1, 5) },
    { start: 14, end: 14, value: "E" },
    ...accountFields,
    { start: 135, end: 142, value: transaction.accountingDate },
    { start: 143, end: 150, value: transaction.eventDate ?? transaction.accountingDate },
    { start: 151, end: 168, value: numeric(transaction.amountCents, 18) },
    { start: 169, end: 169, value: transaction.direction },
    { start: 170, end: 172, value: transaction.category ?? (transaction.direction === "D" ? "125" : "218") },
    { start: 173, end: 176, value: transaction.historyCode ?? "0001" },
    { start: 177, end: 201, value: transaction.description },
    { start: isItau ? 235 : 202, end: 240, value: transaction.document ?? numeric(index + 1, isItau ? 6 : 39) },
  ]));
  const lotTrailer = record([
    { start: 1, end: 3, value: options.bankCode },
    { start: 4, end: 7, value: "0001" },
    { start: 8, end: 8, value: "5" },
  ]);
  const fileTrailer = record([
    { start: 1, end: 3, value: options.bankCode },
    { start: 4, end: 7, value: "9999" },
    { start: 8, end: 8, value: "9" },
  ]);

  return new TextEncoder().encode([header, lotHeader, ...details, lotTrailer, fileTrailer].join("\r\n"));
}
