import { PrismaClient } from "@prisma/client";
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
  __satspayPrisma?: PrismaClient;
  __satspayRemittancesCache?: RemittanceRecord[];
};

function resolveRemoteDbUrl(): string {
  const candidates = [
    process.env.POSTGRES_URL,
    process.env.PRISMA_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.STORAGE_URL,
  ];
  for (const candidate of candidates) {
    const trimmed = (candidate || "").trim();
    if (
      trimmed &&
      !trimmed.includes("@localhost:5432") &&
      !trimmed.includes("@127.0.0.1:5432")
    ) {
      return trimmed;
    }
  }
  return "";
}

function isPostgresEnabled(): boolean {
  return Boolean(resolveRemoteDbUrl());
}

function getPrisma(): PrismaClient {
  if (!globalForStore.__satspayPrisma) {
    const remoteUrl = resolveRemoteDbUrl();
    if (remoteUrl) {
      process.env.DATABASE_URL = remoteUrl;
    }
    globalForStore.__satspayPrisma = new PrismaClient(
      remoteUrl ? { datasources: { db: { url: remoteUrl } } } : undefined
    );
  }
  return globalForStore.__satspayPrisma;
}

function mapPrismaRowToRecord(row: {
  id: string;
  claimCode: string;
  securityPin: string;
  failedPinAttempts: number;
  isLocked: boolean;
  senderName: string;
  recipientName: string;
  amountSentUsdCents: number;
  feeUsdCents: number;
  netPayoutUsdCents: number;
  status: string;
  paymentMode: string;
  usPaymentMethod: string;
  wompiEnlaceId: string | null;
  wompiTransactionId: string | null;
  stripeSessionId: string | null;
  fundingSource: string | null;
  blinkDepositInvoice: string | null;
  strikeQuoteId: string | null;
  strikePaymentId: string | null;
  chivoBolt11Invoice: string | null;
  decodedInvoiceSats: number | null;
  decodedInvoiceUsd: number | null;
  blinkWalletIdUsed: string | null;
  blinkTransactionRef: string | null;
  routingFeeUsdCents: number | null;
  failureReason: string | null;
  claimedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): RemittanceRecord {
  return {
    id: row.id,
    claimCode: row.claimCode,
    securityPin: row.securityPin,
    failedPinAttempts: row.failedPinAttempts,
    isLocked: row.isLocked,
    senderName: row.senderName,
    recipientName: row.recipientName,
    amountSentUsdCents: row.amountSentUsdCents,
    feeUsdCents: row.feeUsdCents,
    netPayoutUsdCents: row.netPayoutUsdCents,
    status: row.status as RemittanceStatus,
    paymentMode: (row.paymentMode as PaymentMode) || "production",
    usPaymentMethod:
      (row.usPaymentMethod as RemittanceRecord["usPaymentMethod"]) || "WOMPI_CARD",
    wompiEnlaceId: row.wompiEnlaceId ?? undefined,
    wompiTransactionId: row.wompiTransactionId ?? undefined,
    stripeSessionId: row.stripeSessionId ?? undefined,
    fundingSource:
      (row.fundingSource as RemittanceRecord["fundingSource"]) ?? undefined,
    blinkDepositInvoice: row.blinkDepositInvoice ?? undefined,
    strikeQuoteId: row.strikeQuoteId ?? undefined,
    strikePaymentId: row.strikePaymentId ?? undefined,
    chivoBolt11Invoice: row.chivoBolt11Invoice ?? undefined,
    decodedInvoiceSats: row.decodedInvoiceSats ?? undefined,
    decodedInvoiceUsd: row.decodedInvoiceUsd ?? undefined,
    blinkWalletIdUsed: row.blinkWalletIdUsed ?? undefined,
    blinkTransactionRef: row.blinkTransactionRef ?? undefined,
    routingFeeUsdCents: row.routingFeeUsdCents ?? undefined,
    failureReason: row.failureReason ?? undefined,
    claimedAt: row.claimedAt ? row.claimedAt.toISOString() : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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

export async function listRemittances(): Promise<RemittanceRecord[]> {
  if (isPostgresEnabled()) {
    try {
      const rows = await getPrisma().remittance.findMany({
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapPrismaRowToRecord);
    } catch (err) {
      console.error("[Prisma listRemittances fallback]", err);
    }
  }
  const records = ensureDataFile();
  return records.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getRemittanceByClaimCode(
  claimCode: string
): Promise<RemittanceRecord | null> {
  const normalized = claimCode.trim().toUpperCase();
  if (isPostgresEnabled()) {
    try {
      const row = await getPrisma().remittance.findUnique({
        where: { claimCode: normalized },
      });
      return row ? mapPrismaRowToRecord(row) : null;
    } catch (err) {
      console.error("[Prisma getRemittanceByClaimCode fallback]", err);
    }
  }
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

export async function createRemittance(input: {
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
}): Promise<RemittanceRecord> {
  if (isPostgresEnabled()) {
    try {
      const existing = await getPrisma().remittance.findMany({
        select: { claimCode: true },
      });
      const existingCodes = new Set(existing.map((r) => r.claimCode.toUpperCase()));
      const claimCode = generateClaimCode(existingCodes);

      const created = await getPrisma().remittance.create({
        data: {
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
          fundingSource: input.fundingSource ?? null,
          wompiEnlaceId: input.wompiEnlaceId ?? null,
          wompiTransactionId: input.wompiTransactionId ?? null,
          stripeSessionId: input.stripeSessionId ?? null,
          blinkDepositInvoice: input.blinkDepositInvoice ?? null,
          strikeQuoteId: input.strikeQuoteId ?? null,
          strikePaymentId: input.strikePaymentId ?? null,
        },
      });
      return mapPrismaRowToRecord(created);
    } catch (err) {
      console.error("[Prisma createRemittance fallback]", err);
    }
  }

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

export async function verifyAndRecordPinAttempt(
  claimCode: string,
  candidatePin: string
): Promise<{
  valid: boolean;
  locked: boolean;
  remainingAttempts: number;
  record: RemittanceRecord | null;
}> {
  const normalized = claimCode.trim().toUpperCase();

  if (isPostgresEnabled()) {
    try {
      const existing = await getPrisma().remittance.findUnique({
        where: { claimCode: normalized },
      });
      if (!existing) {
        return { valid: false, locked: false, remainingAttempts: 0, record: null };
      }

      if (existing.isLocked || existing.failedPinAttempts >= MAX_PIN_ATTEMPTS) {
        const lockedRow = await getPrisma().remittance.update({
          where: { claimCode: normalized },
          data: { isLocked: true },
        });
        return {
          valid: false,
          locked: true,
          remainingAttempts: 0,
          record: mapPrismaRowToRecord(lockedRow),
        };
      }

      if (existing.securityPin === candidatePin.trim()) {
        const updatedRow = await getPrisma().remittance.update({
          where: { claimCode: normalized },
          data: { failedPinAttempts: 0 },
        });
        return {
          valid: true,
          locked: false,
          remainingAttempts: MAX_PIN_ATTEMPTS,
          record: mapPrismaRowToRecord(updatedRow),
        };
      }

      const nextAttempts = existing.failedPinAttempts + 1;
      const nextLocked = nextAttempts >= MAX_PIN_ATTEMPTS;
      const failedRow = await getPrisma().remittance.update({
        where: { claimCode: normalized },
        data: {
          failedPinAttempts: nextAttempts,
          isLocked: nextLocked,
        },
      });

      return {
        valid: false,
        locked: failedRow.isLocked,
        remainingAttempts: Math.max(0, MAX_PIN_ATTEMPTS - failedRow.failedPinAttempts),
        record: mapPrismaRowToRecord(failedRow),
      };
    } catch (err) {
      console.error("[Prisma verifyAndRecordPinAttempt fallback]", err);
    }
  }

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

export async function unlockRemittanceByClaimCode(
  claimCode: string
): Promise<RemittanceRecord | null> {
  return updateRemittanceByClaimCode(claimCode, {
    failedPinAttempts: 0,
    isLocked: false,
  });
}

export async function updateRemittanceByClaimCode(
  claimCode: string,
  patch: Partial<Omit<RemittanceRecord, "id" | "claimCode" | "createdAt">>
): Promise<RemittanceRecord | null> {
  const normalized = claimCode.trim().toUpperCase();

  if (isPostgresEnabled()) {
    try {
      const data: Record<string, unknown> = {};
      if (patch.securityPin !== undefined) data.securityPin = patch.securityPin;
      if (patch.failedPinAttempts !== undefined)
        data.failedPinAttempts = patch.failedPinAttempts;
      if (patch.isLocked !== undefined) data.isLocked = patch.isLocked;
      if (patch.senderName !== undefined) data.senderName = patch.senderName;
      if (patch.recipientName !== undefined) data.recipientName = patch.recipientName;
      if (patch.amountSentUsdCents !== undefined)
        data.amountSentUsdCents = patch.amountSentUsdCents;
      if (patch.feeUsdCents !== undefined) data.feeUsdCents = patch.feeUsdCents;
      if (patch.netPayoutUsdCents !== undefined)
        data.netPayoutUsdCents = patch.netPayoutUsdCents;
      if (patch.status !== undefined) data.status = patch.status;
      if (patch.paymentMode !== undefined) data.paymentMode = patch.paymentMode;
      if (patch.usPaymentMethod !== undefined)
        data.usPaymentMethod = patch.usPaymentMethod;
      if ("wompiEnlaceId" in patch) data.wompiEnlaceId = patch.wompiEnlaceId ?? null;
      if ("wompiTransactionId" in patch)
        data.wompiTransactionId = patch.wompiTransactionId ?? null;
      if ("stripeSessionId" in patch)
        data.stripeSessionId = patch.stripeSessionId ?? null;
      if ("fundingSource" in patch) data.fundingSource = patch.fundingSource ?? null;
      if ("blinkDepositInvoice" in patch)
        data.blinkDepositInvoice = patch.blinkDepositInvoice ?? null;
      if ("strikeQuoteId" in patch) data.strikeQuoteId = patch.strikeQuoteId ?? null;
      if ("strikePaymentId" in patch)
        data.strikePaymentId = patch.strikePaymentId ?? null;
      if ("chivoBolt11Invoice" in patch)
        data.chivoBolt11Invoice = patch.chivoBolt11Invoice ?? null;
      if ("decodedInvoiceSats" in patch)
        data.decodedInvoiceSats = patch.decodedInvoiceSats ?? null;
      if ("decodedInvoiceUsd" in patch)
        data.decodedInvoiceUsd = patch.decodedInvoiceUsd ?? null;
      if ("blinkWalletIdUsed" in patch)
        data.blinkWalletIdUsed = patch.blinkWalletIdUsed ?? null;
      if ("blinkTransactionRef" in patch)
        data.blinkTransactionRef = patch.blinkTransactionRef ?? null;
      if ("routingFeeUsdCents" in patch)
        data.routingFeeUsdCents = patch.routingFeeUsdCents ?? null;
      if ("failureReason" in patch) data.failureReason = patch.failureReason ?? null;
      if ("claimedAt" in patch)
        data.claimedAt = patch.claimedAt ? new Date(patch.claimedAt) : null;

      const updated = await getPrisma().remittance.update({
        where: { claimCode: normalized },
        data,
      });
      return mapPrismaRowToRecord(updated);
    } catch (err) {
      console.error("[Prisma updateRemittanceByClaimCode fallback]", err);
    }
  }

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
