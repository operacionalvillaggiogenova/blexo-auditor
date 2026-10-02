import type {
  BankProfile,
  ParseIssue,
  ParsedAccount,
  ParsedCnab,
  ParsedLot,
  ParsedTransaction,
} from "./types";

type Position = readonly [start: number, end: number];

type ProfileDefinition = {
  profile: BankProfile;
  bankCode: string;
  branch: Position;
  branchDigit: Position;
  account: Position;
  accountDigit: Position;
  branchAccountDigit: Position;
  document: Position;
};

const profiles: Record<string, ProfileDefinition> = {
  "341": {
    profile: "ITAU_341",
    bankCode: "341",
    branch: [54, 57],
    branchDigit: [58, 58],
    account: [66, 70],
    accountDigit: [71, 71],
    branchAccountDigit: [72, 72],
    document: [235, 240],
  },
  "748": {
    profile: "SICREDI_748",
    bankCode: "748",
    branch: [53, 57],
    branchDigit: [58, 58],
    account: [59, 70],
    accountDigit: [71, 71],
    branchAccountDigit: [72, 72],
    document: [202, 240],
  },
};

function trimField(value: string): string {
  return value.trim().replace(/^0+(?=\d)/, "");
}

function field(line: string, [start, end]: Position): string {
  return line.slice(start - 1, end);
}

function parseDate(value: string, lineNumber: number, fieldName: string): string {
  if (!/^\d{8}$/.test(value)) throw new Error(`${fieldName} inválida na linha ${lineNumber}`);
  const day = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const year = Number(value.slice(4, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${fieldName} inválida na linha ${lineNumber}`);
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseOptionalDate(value: string, lineNumber: number): string | null {
  if (/^[0 ]{8}$/.test(value)) return null;
  return parseDate(value, lineNumber, "Data do lançamento");
}

function parseAmount(value: string, lineNumber: number): number {
  if (!/^\d+$/.test(value)) throw new Error(`Valor inválido na linha ${lineNumber}`);
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`Valor fora do intervalo na linha ${lineNumber}`);
  return amount;
}

function parseAccount(line: string, profile: ProfileDefinition): ParsedAccount {
  return {
    bankCode: profile.bankCode,
    branchNumber: trimField(field(line, profile.branch)),
    branchCheckDigit: field(line, profile.branchDigit).trim(),
    accountNumber: trimField(field(line, profile.account)),
    accountCheckDigit: field(line, profile.accountDigit).trim(),
    branchAccountCheckDigit: field(line, profile.branchAccountDigit).trim(),
  };
}

function decodeRecord(bytes: Uint8Array): string {
  return new TextDecoder("windows-1252", { fatal: false }).decode(bytes);
}

export function splitCnabRecords(input: Uint8Array): { records: string[]; issues: ParseIssue[] } {
  const records: string[] = [];
  const issues: ParseIssue[] = [];
  let start = 0;
  let lineNumber = 1;

  for (let index = 0; index <= input.length; index += 1) {
    if (index !== input.length && input[index] !== 10) continue;
    let end = index;
    if (end > start && input[end - 1] === 13) end -= 1;
    if (end === start && index === input.length) break;
    const recordBytes = input.slice(start, end);
    if (recordBytes.length !== 240) {
      issues.push({
        severity: "ERROR",
        code: "INVALID_RECORD_LENGTH",
        message: `Registro deve ter 240 bytes e possui ${recordBytes.length}`,
        lineNumber,
      });
    } else {
      records.push(decodeRecord(recordBytes));
    }
    start = index + 1;
    lineNumber += 1;
  }

  return { records, issues };
}

export function parseCnab240(input: Uint8Array): ParsedCnab {
  const { records, issues } = splitCnabRecords(input);
  if (records.length < 4) throw new Error("Arquivo CNAB240 incompleto");

  const fileHeader = records[0];
  if (!fileHeader || fileHeader[7] !== "0") throw new Error("Header de arquivo CNAB240 ausente");
  const bankCode = fileHeader.slice(0, 3);
  const profile = profiles[bankCode];
  if (!profile) throw new Error(`Banco ${bankCode || "desconhecido"} não suportado`);

  const lots: ParsedLot[] = [];
  let currentLot: ParsedLot | null = null;
  let debitCents = 0;
  let creditCents = 0;

  records.forEach((line, recordIndex) => {
    const lineNumber = recordIndex + 1;
    const recordType = line[7];

    if (recordType === "1") {
      const operationType = line[8] ?? "";
      const serviceType = line.slice(9, 11);
      const lotNumber = line.slice(3, 7);
      currentLot = {
        lotNumber,
        account: parseAccount(line, profile),
        operationType,
        serviceType,
        layoutVersion: line.slice(13, 16),
        transactions: [],
      };
      if (operationType !== "E" || serviceType !== "04") {
        issues.push({
          severity: "ERROR",
          code: "UNSUPPORTED_LOT",
          message: `Lote ${lotNumber} não é extrato de conciliação E/04`,
          lineNumber,
        });
      }
      lots.push(currentLot);
      return;
    }

    if (recordType === "3" && line[13] === "E") {
      if (!currentLot) {
        issues.push({ severity: "ERROR", code: "DETAIL_WITHOUT_LOT", message: "Segmento E sem header de lote", lineNumber });
        return;
      }
      try {
        const directionCode = line[168];
        if (directionCode !== "D" && directionCode !== "C") {
          throw new Error(`Tipo débito/crédito inválido na linha ${lineNumber}`);
        }
        const transaction: ParsedTransaction = {
          sourceLineNumber: lineNumber,
          lotNumber: currentLot.lotNumber,
          recordSequence: line.slice(8, 13),
          bankCode,
          account: parseAccount(line, profile),
          accountingDate: parseDate(line.slice(134, 142), lineNumber, "Data contábil"),
          sourceEventDate: parseOptionalDate(line.slice(142, 150), lineNumber),
          amountCents: parseAmount(line.slice(150, 168), lineNumber),
          direction: directionCode === "D" ? "DEBIT" : "CREDIT",
          categoryCode: line.slice(169, 172).trim(),
          historyCode: line.slice(172, 176).trim(),
          description: line.slice(176, 201).trim(),
          documentNumber: field(line, profile.document).trim(),
          rawRecord: line,
        };
        currentLot.transactions.push(transaction);
        if (transaction.direction === "DEBIT") debitCents += transaction.amountCents;
        else creditCents += transaction.amountCents;
      } catch (error) {
        issues.push({
          severity: "ERROR",
          code: "INVALID_DETAIL",
          message: error instanceof Error ? error.message : "Registro detalhe inválido",
          lineNumber,
        });
      }
    }
  });

  if (records.at(-1)?.[7] !== "9") {
    issues.push({ severity: "ERROR", code: "MISSING_FILE_TRAILER", message: "Trailer de arquivo ausente" });
  }
  if (lots.length === 0) {
    issues.push({ severity: "ERROR", code: "NO_LOTS", message: "Nenhum lote de extrato encontrado" });
  }

  return {
    profile: profile.profile,
    bankCode,
    fileLayoutVersion: fileHeader.slice(163, 166),
    lots,
    issues,
    totals: {
      records: lots.reduce((total, lot) => total + lot.transactions.length, 0),
      debitCents,
      creditCents,
    },
  };
}
