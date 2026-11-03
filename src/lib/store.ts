import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import type { PaymentMode } from "./blink";

export type RemittanceStatus =
  | "PENDING_PAYMENT"
  | "READY_TO_CLAIM"
  | "PROCESSING_PAYOUT"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";

export const MAX_PIN_ATTEMPTS = 5;

export interface RemittanceRecord {
  id: string;
  claimCode: string;
  securityPin: string; // PIN secreto de 4 dígitos requerido para cobrar
  failedPinAttempts: number; // Contador de intentos fallidos de PIN
  isLocked: boolean; // Bloqueado tras 5 intentos fallidos
  senderName: string;
  recipientName: string;
  amountSentUsdCents: number; // Total cobrado al remitente (centavos)
  feeUsdCents: number; // Comisión de la plataforma (centavos)
  netPayoutUsdCents: number; // Monto neto exacto que el destinatario recibe en Chivo Wallet (centavos USD)
  status: RemittanceStatus;
  paymentMode: PaymentMode;
  usPaymentMethod: "WOMPI_CARD" | "STRIPE_CARD" | "ACH_BANK" | "TEST_ZERO_FEE";
  wompiEnlaceId?: string;
  wompiTransactionId?: string;
  stripeSessionId?: string;
  fundingSource?: "prefunded_blink" | "strike_api";
  blinkDepositInvoice?: string;
  strikeQuoteId?: string;
  strikePaymentId?: string;
  chivoBolt11Invoice?: string;
  decodedInvoiceSats?: number;
  decodedInvoiceUsd?: number;
  blinkWalletIdUsed?: string;
  blinkTransactionRef?: string;
  routingFeeUsdCents?: number;
  failureReason?: string;
  claimedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicRemittanceSummary {
  claimCode: string;
  status: RemittanceStatus;
  isLocked: boolean;
  remainingAttempts: number;
  claimedAt?: string;
}

export interface VerifiedRecipientRemittanceView {
  claimCode: string;
  senderName: string;
  recipientName: string;
  netPayoutUsdCents: number;
  status: RemittanceStatus;
  claimedAt?: string;
  createdAt: string;
}

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "satspay-data")
  : path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "remittances.json");

const globalForStore = globalThis as unknown as {
  __satspayRemittancesCache?: RemittanceRecord[];
};

function ensureDataFile(): RemittanceRecord[] {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!existsSync(DB_FILE)) {
      const initial = globalForStore.__satspayRemittancesCache || [];
      writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf-8");
      return initial;
    }
    const content = readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return globalForStore.__satspayRemittancesCache || [];
    const normalized = (parsed as Partial<RemittanceRecord>[]).map((r) => ({
      ...r,
      securityPin: r.securityPin || "1234",
      failedPinAttempts: r.failedPinAttempts ?? 0,
      isLocked: r.isLocked ?? false,
    })) as RemittanceRecord[];
    globalForStore.__satspayRemittancesCache = normalized;
    return normalized;
  } catch {
    return globalForStore.__satspayRemittancesCache || [];
  }
}

function saveDataFile(records: RemittanceRecord[]) {
  globalForStore.__satspayRemittancesCache = records;
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(DB_FILE, JSON.stringify(records, null, 2), "utf-8");
  } catch {
    // Fallback en memoria si el filesystem temporal no está disponible
  }
}

function generateClaimCode(existingCodes: Set<string>): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt++) {
    const part1 = Array.from({ length: 4 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
    const part2 = Array.from({ length: 3 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
    const code = `SV-${part1}-${part2}`;
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  return `SV-${Date.now().toString().slice(-7)}`;
}

export function listRemittances(): RemittanceRecord[] {
  const records = ensureDataFile();
  return records.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getRemittanceByClaimCode(claimCode: string): RemittanceRecord | null {
  const normalized = claimCode.trim().toUpperCase();
  const records = ensureDataFile();
  return records.find((r) => r.claimCode.toUpperCase() === normalized) || null;
}

export function toPublicSummary(record: RemittanceRecord): PublicRemittanceSummary {
  return {
    claimCode: record.claimCode,
    status: record.status,
    isLocked: record.isLocked,
    remainingAttempts: Math.max(0, MAX_PIN_ATTEMPTS - record.failedPinAttempts),
    claimedAt: record.claimedAt,
  };
}

export function toVerifiedRecipientView(
  record: RemittanceRecord
): VerifiedRecipientRemittanceView {
  return {
    claimCode: record.claimCode,
    senderName: record.senderName,
    recipientName: record.recipientName,
    netPayoutUsdCents: record.netPayoutUsdCents,
    status: record.status,
    claimedAt: record.claimedAt,
    createdAt: record.createdAt,
  };
}

export function createRemittance(input: {
  senderName: string;
  recipientName: string;
  securityPin: string;
  amountSentUsdCents: number;
  feeUsdCents: number;
  netPayoutUsdCents: number;
  paymentMode: PaymentMode;
  usPaymentMethod: "WOMPI_CARD" | "STRIPE_CARD" | "ACH_BANK" | "TEST_ZERO_FEE";
  initialStatus?: RemittanceStatus;
  fundingSource?: "prefunded_blink" | "strike_api";
  wompiEnlaceId?: string;
  wompiTransactionId?: string;
  stripeSessionId?: string;
  blinkDepositInvoice?: string;
  strikeQuoteId?: string;
  strikePaymentId?: string;
}): RemittanceRecord {
  const records = ensureDataFile();
  const existingCodes = new Set(records.map((r) => r.claimCode.toUpperCase()));
  const claimCode = generateClaimCode(existingCodes);
  const now = new Date().toISOString();

  const newRecord: RemittanceRecord = {
    id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    claimCode,
    securityPin: input.securityPin.trim(),
    failedPinAttempts: 0,
    isLocked: false,
    senderName: input.senderName.trim(),
    recipientName: input.recipientName.trim(),
    amountSentUsdCents: input.amountSentUsdCents,
    feeUsdCents: input.feeUsdCents,
    netPayoutUsdCents: input.netPayoutUsdCents,
    status: input.initialStatus || "READY_TO_CLAIM",
    paymentMode: input.paymentMode,
    usPaymentMethod: input.usPaymentMethod,
    fundingSource: input.fundingSource,
    wompiEnlaceId: input.wompiEnlaceId,
    wompiTransactionId: input.wompiTransactionId,
    stripeSessionId: input.stripeSessionId,
    blinkDepositInvoice: input.blinkDepositInvoice,
    strikeQuoteId: input.strikeQuoteId,
    strikePaymentId: input.strikePaymentId,
    createdAt: now,
    updatedAt: now,
  };

  records.unshift(newRecord);
  saveDataFile(records);
  return newRecord;
}

export function verifyAndRecordPinAttempt(
  claimCode: string,
  candidatePin: string
): {
  valid: boolean;
  locked: boolean;
  remainingAttempts: number;
  record: RemittanceRecord | null;
} {
  const normalized = claimCode.trim().toUpperCase();
  const records = ensureDataFile();
  const idx = records.findIndex((r) => r.claimCode.toUpperCase() === normalized);
  if (idx === -1) {
    return { valid: false, locked: false, remainingAttempts: 0, record: null };
  }

  const record = records[idx];
  if (record.isLocked || record.failedPinAttempts >= MAX_PIN_ATTEMPTS) {
    record.isLocked = true;
    saveDataFile(records);
    return {
      valid: false,
      locked: true,
      remainingAttempts: 0,
      record,
    };
  }

  if (record.securityPin === candidatePin.trim()) {
    record.failedPinAttempts = 0;
    record.updatedAt = new Date().toISOString();
    records[idx] = record;
    saveDataFile(records);
    return {
      valid: true,
      locked: false,
      remainingAttempts: MAX_PIN_ATTEMPTS,
      record,
    };
  }

  record.failedPinAttempts += 1;
  if (record.failedPinAttempts >= MAX_PIN_ATTEMPTS) {
    record.isLocked = true;
  }
  record.updatedAt = new Date().toISOString();
  records[idx] = record;
  saveDataFile(records);

  return {
    valid: false,
    locked: record.isLocked,
    remainingAttempts: Math.max(0, MAX_PIN_ATTEMPTS - record.failedPinAttempts),
    record,
  };
}

export function unlockRemittanceByClaimCode(claimCode: string): RemittanceRecord | null {
  return updateRemittanceByClaimCode(claimCode, {
    failedPinAttempts: 0,
    isLocked: false,
  });
}

export function updateRemittanceByClaimCode(
  claimCode: string,
  patch: Partial<Omit<RemittanceRecord, "id" | "claimCode" | "createdAt">>
): RemittanceRecord | null {
  const normalized = claimCode.trim().toUpperCase();
  const records = ensureDataFile();
  const idx = records.findIndex((r) => r.claimCode.toUpperCase() === normalized);
  if (idx === -1) return null;

  const updated: RemittanceRecord = {
    ...records[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  records[idx] = updated;
  saveDataFile(records);
  return updated;
}
