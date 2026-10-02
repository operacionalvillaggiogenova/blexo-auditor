export type BankProfile = "ITAU_341" | "SICREDI_748";

export type ParsedAccount = {
  bankCode: string;
  branchNumber: string;
  branchCheckDigit: string;
  accountNumber: string;
  accountCheckDigit: string;
  branchAccountCheckDigit: string;
};

export type ParsedTransaction = {
  sourceLineNumber: number;
  lotNumber: string;
  recordSequence: string;
  bankCode: string;
  account: ParsedAccount;
  accountingDate: string;
  sourceEventDate: string | null;
  direction: "DEBIT" | "CREDIT";
  amountCents: number;
  categoryCode: string;
  historyCode: string;
  description: string;
  documentNumber: string;
  rawRecord: string;
};

export type ParsedLot = {
  lotNumber: string;
  account: ParsedAccount;
  operationType: string;
  serviceType: string;
  layoutVersion: string;
  transactions: ParsedTransaction[];
};

export type ParseIssue = {
  severity: "ERROR" | "WARNING";
  code: string;
  message: string;
  lineNumber?: number;
};

export type ParsedCnab = {
  profile: BankProfile;
  bankCode: string;
  fileLayoutVersion: string;
  lots: ParsedLot[];
  issues: ParseIssue[];
  totals: {
    records: number;
    debitCents: number;
    creditCents: number;
  };
};
