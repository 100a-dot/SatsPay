import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

/**
 * Cliente interno para Blink GraphQL API (https://api.blink.sv/graphql)
 * Uso exclusivo del servidor y del panel de administración (/admin).
 */

export type PaymentMode = "mock" | "production";
export type CheckoutProviderMode = "wompi" | "stripe" | "direct";
export type FundingSourceMode = "prefunded_blink" | "strike_api";

export interface BlinkWallet {
  id: string;
  walletCurrency: "BTC" | "USD";
  balance: number; // En satoshis para BTC, en centavos (cents) para USD (Stablesats)
}

export interface BlinkAccountStatus {
  connected: boolean;
  mode: PaymentMode;
  endpoint: string;
  accountId?: string;
  btcWallet?: BlinkWallet;
  usdWallet?: BlinkWallet; // Billetera Stablesats (100 = $1.00 USD)
  btcPriceUsd?: number;
  hasConfiguredApiKey?: boolean;
  zeroFeePublicMode?: boolean;
  usCheckoutMode?: CheckoutProviderMode;
  hasWompiKeys?: boolean;
  hasStripeKey?: boolean;
  fundingSourceMode?: FundingSourceMode;
  hasStrikeKey?: boolean;
  error?: string;
}

export interface BlinkInvoiceResult {
  paymentRequest: string;
  paymentHash: string;
  paymentSecret?: string;
  satoshis?: number;
}

export interface BlinkPaymentResult {
  status: "SUCCESS" | "PENDING" | "FAILURE" | "ALREADY_PAID";
  errors: Array<{ message: string; code?: string }>;
  mode: PaymentMode;
}

interface RuntimeConfigFile {
  mode?: PaymentMode;
  apiKey?: string;
  adminPassword?: string;
  zeroFeePublicMode?: boolean;
  usCheckoutMode?: CheckoutProviderMode;
  wompiAppId?: string;
  wompiApiSecret?: string;
  stripeSecretKey?: string;
  fundingSourceMode?: FundingSourceMode;
  strikeApiKey?: string;
  updatedAt?: string;
}

const DEFAULT_BLINK_URL = "https://api.blink.sv/graphql";
const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "satspay-data")
  : path.join(process.cwd(), "data");
const RUNTIME_CONFIG_PATH = path.join(DATA_DIR, "runtime-config.json");

const globalForBlink = globalThis as unknown as {
  __satspayRuntimeConfig?: RuntimeConfigFile;
};

function readRuntimeConfig(): RuntimeConfigFile {
  try {
    if (existsSync(RUNTIME_CONFIG_PATH)) {
      const raw = readFileSync(RUNTIME_CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw) as RuntimeConfigFile;
      globalForBlink.__satspayRuntimeConfig = parsed;
      return parsed;
    }
  } catch {
    // Ignorar errores de lectura
  }
  return globalForBlink.__satspayRuntimeConfig || {};
}

export function saveRuntimeBlinkConfig(config: {
  mode?: PaymentMode;
  apiKey?: string;
  adminPassword?: string;
  zeroFeePublicMode?: boolean;
  usCheckoutMode?: CheckoutProviderMode;
  wompiAppId?: string;
  wompiApiSecret?: string;
  stripeSecretKey?: string;
  fundingSourceMode?: FundingSourceMode;
  strikeApiKey?: string;
}) {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    const current = readRuntimeConfig();
    const updated: RuntimeConfigFile = {
      mode: config.mode ?? current.mode,
      apiKey: config.apiKey !== undefined ? config.apiKey.trim() : current.apiKey,
      adminPassword:
        config.adminPassword !== undefined ? config.adminPassword : current.adminPassword,
      zeroFeePublicMode:
        config.zeroFeePublicMode !== undefined
          ? config.zeroFeePublicMode
          : current.zeroFeePublicMode,
      usCheckoutMode: config.usCheckoutMode ?? current.usCheckoutMode,
      wompiAppId:
        config.wompiAppId !== undefined ? config.wompiAppId.trim() : current.wompiAppId,
      wompiApiSecret:
        config.wompiApiSecret !== undefined
          ? config.wompiApiSecret.trim()
          : current.wompiApiSecret,
      stripeSecretKey:
        config.stripeSecretKey !== undefined
          ? config.stripeSecretKey.trim()
          : current.stripeSecretKey,
      fundingSourceMode: config.fundingSourceMode ?? current.fundingSourceMode,
      strikeApiKey:
        config.strikeApiKey !== undefined
          ? config.strikeApiKey.trim()
          : current.strikeApiKey,
      updatedAt: new Date().toISOString(),
    };
    globalForBlink.__satspayRuntimeConfig = updated;
    writeFileSync(RUNTIME_CONFIG_PATH, JSON.stringify(updated, null, 2), "utf-8");
  } catch {
    // Ignorar errores de escritura
  }
}

export function getAdminPassword(): string {
  const runtime = readRuntimeConfig();
  return runtime.adminPassword || process.env.ADMIN_PASSWORD || "admin1234";
}

export function getZeroFeePublicMode(): boolean {
  const runtime = readRuntimeConfig();
  if (runtime.zeroFeePublicMode !== undefined) {
    return runtime.zeroFeePublicMode;
  }
  return true;
}

export function getUsCheckoutConfig(): {
  usCheckoutMode: CheckoutProviderMode;
  wompiAppId: string;
  wompiApiSecret: string;
  stripeSecretKey: string;
  fundingSourceMode: FundingSourceMode;
  strikeApiKey: string;
} {
  const runtime = readRuntimeConfig();
  const wompiAppId =
    runtime.wompiAppId?.trim() || process.env.WOMPI_APP_ID?.trim() || "";
  const wompiApiSecret =
    runtime.wompiApiSecret?.trim() || process.env.WOMPI_API_SECRET?.trim() || "";
  const stripeSecretKey =
    runtime.stripeSecretKey?.trim() || process.env.STRIPE_SECRET_KEY?.trim() || "";
  const strikeApiKey =
    runtime.strikeApiKey?.trim() || process.env.STRIKE_API_KEY?.trim() || "";

  const savedMode = runtime.usCheckoutMode;
  const usCheckoutMode: CheckoutProviderMode =
    savedMode === "wompi" || savedMode === "stripe" || savedMode === "direct"
      ? savedMode
      : "wompi";

  const fundingSourceMode: FundingSourceMode =
    runtime.fundingSourceMode || "prefunded_blink";

  return {
    usCheckoutMode,
    wompiAppId,
    wompiApiSecret,
    stripeSecretKey,
    fundingSourceMode,
    strikeApiKey,
  };
}

export function getPaymentMode(overrideMode?: PaymentMode): PaymentMode {
  if (overrideMode) return overrideMode;
  const runtime = readRuntimeConfig();
  if (runtime.mode) return runtime.mode;
  const envMode = (process.env.PAYMENT_MODE || "").toLowerCase();
  if (envMode === "production" || envMode === "mock") {
    return envMode;
  }
  return process.env.BLINK_API_KEY?.trim() ? "production" : "mock";
}

export function getBlinkConfig(overrideApiKey?: string) {
  const apiUrl = process.env.BLINK_API_URL || DEFAULT_BLINK_URL;
  const runtime = readRuntimeConfig();
  const apiKey =
    overrideApiKey?.trim() ||
    runtime.apiKey?.trim() ||
    process.env.BLINK_API_KEY?.trim() ||
    "";
  return { apiUrl, apiKey };
}

/**
 * Ejecuta una consulta o mutación contra el endpoint GraphQL de Blink.
 */
async function executeBlinkGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
  overrideApiKey?: string
): Promise<{ data?: T; errors?: Array<{ message: string; extensions?: { code?: string } }> }> {
  const { apiUrl, apiKey } = getBlinkConfig(overrideApiKey);

  if (!apiKey) {
    throw new Error(
      "BLINK_API_KEY no está configurada en el sistema. Configúrala en /admin o en el archivo .env."
    );
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error HTTP ${response.status} desde Blink API: ${text}`);
  }

  return response.json();
}

/**
 * Obtiene el estado de la cuenta en Blink, incluyendo el walletId y saldo
 * tanto de la billetera BTC como de la billetera USD (Stablesats).
 */
export async function getBlinkAccountStatus(options?: {
  overrideMode?: PaymentMode;
  overrideApiKey?: string;
  persistIfValid?: boolean;
}): Promise<BlinkAccountStatus> {
  const mode = getPaymentMode(options?.overrideMode);
  const { apiUrl, apiKey } = getBlinkConfig(options?.overrideApiKey);
  const zeroFeePublicMode = getZeroFeePublicMode();
  const checkoutCfg = getUsCheckoutConfig();
  const extraFlags = {
    zeroFeePublicMode,
    usCheckoutMode: checkoutCfg.usCheckoutMode,
    hasWompiKeys: Boolean(checkoutCfg.wompiAppId && checkoutCfg.wompiApiSecret),
    hasStripeKey: Boolean(checkoutCfg.stripeSecretKey),
    fundingSourceMode: checkoutCfg.fundingSourceMode,
    hasStrikeKey: Boolean(checkoutCfg.strikeApiKey),
  };

  if (mode === "mock") {
    if (options?.persistIfValid) {
      saveRuntimeBlinkConfig({ mode: "mock" });
    }
    return {
      connected: true,
      mode: "mock",
      endpoint: `${apiUrl} (Simulado Local)`,
      accountId: "mock-account-el-salvador-01",
      btcWallet: {
        id: "mock-wallet-btc-001",
        walletCurrency: "BTC",
        balance: 150000,
      },
      usdWallet: {
        id: "mock-wallet-stablesats-usd-001",
        walletCurrency: "USD",
        balance: 25000,
      },
      btcPriceUsd: 88500.0,
      hasConfiguredApiKey: Boolean(apiKey),
      ...extraFlags,
    };
  }

  if (!apiKey) {
    return {
      connected: false,
      mode,
      endpoint: apiUrl,
      hasConfiguredApiKey: false,
      ...extraFlags,
      error:
        "Falta BLINK_API_KEY. Pega tu API Key de Blink en el Panel de Administración (/admin) o en tu archivo .env.",
    };
  }

  const query = `
    query BlinkAccountDiagnostics {
      me {
        defaultAccount {
          id
          wallets {
            id
            walletCurrency
            balance
          }
        }
      }
      btcPriceList(range: ONE_DAY) {
        price {
          formattedAmount
          base
          offset
        }
      }
    }
  `;

  try {
    const result = await executeBlinkGraphQL<{
      me: {
        defaultAccount: {
          id: string;
          wallets: BlinkWallet[];
        } | null;
      } | null;
      btcPriceList?: Array<{
        price?: {
          formattedAmount?: string;
          base?: number;
          offset?: number;
        };
      }>;
    }>(query, {}, apiKey);

    if (result.errors && result.errors.length > 0) {
      return {
        connected: false,
        mode: "production",
        endpoint: apiUrl,
        hasConfiguredApiKey: true,
        ...extraFlags,
        error: result.errors.map((e) => e.message).join("; "),
      };
    }

    const defaultAccount = result.data?.me?.defaultAccount;
    if (!defaultAccount) {
      return {
        connected: false,
        mode: "production",
        endpoint: apiUrl,
        hasConfiguredApiKey: true,
        ...extraFlags,
        error:
          "La API Key fue autenticada pero no devolvió 'me.defaultAccount'. Verifica que la API Key tenga el permiso (scope) READ activo.",
      };
    }

    if (options?.persistIfValid) {
      saveRuntimeBlinkConfig({
        mode: "production",
        apiKey: options.overrideApiKey?.trim() || apiKey,
      });
    }

    const btcWallet = defaultAccount.wallets.find((w) => w.walletCurrency === "BTC");
    const usdWallet = defaultAccount.wallets.find((w) => w.walletCurrency === "USD");

    let btcPriceUsd: number | undefined;
    const priceList = result.data?.btcPriceList;
    if (priceList && priceList.length > 0) {
      const latest = priceList[priceList.length - 1]?.price;
      if (latest?.base !== undefined && latest?.offset !== undefined) {
        btcPriceUsd = latest.base / Math.pow(10, latest.offset) / 100;
      }
    }

    return {
      connected: true,
      mode: "production",
      endpoint: apiUrl,
      accountId: defaultAccount.id,
      btcWallet,
      usdWallet,
      btcPriceUsd,
      hasConfiguredApiKey: true,
      ...extraFlags,
    };
  } catch (err) {
    return {
      connected: false,
      mode: "production",
      endpoint: apiUrl,
      hasConfiguredApiKey: Boolean(apiKey),
      ...extraFlags,
      error: err instanceof Error ? err.message : "Error desconocido al conectar con Blink API",
    };
  }
}

/**
 * Crea una factura Lightning denominada en centavos de USD (Stablesats)
 * para recargar nuestra billetera USD de Blink desde Chivo Wallet o cualquier Lightning Wallet.
 */
export async function createStablesatsUsdInvoice(params: {
  usdWalletId: string;
  amountCents: number;
  memo?: string;
  overrideMode?: PaymentMode;
  overrideApiKey?: string;
}): Promise<BlinkInvoiceResult> {
  const mode = getPaymentMode(params.overrideMode);

  if (!Number.isInteger(params.amountCents) || params.amountCents < 1) {
    throw new Error("El monto para crear una factura Stablesats USD debe ser al menos 1 centavo ($0.01 USD).");
  }

  if (mode === "mock") {
    const fakeHash = Array.from({ length: 64 }, (_, i) => ((i + params.amountCents) % 16).toString(16)).join("");
    return {
      paymentRequest: `lnbc${params.amountCents}u1p_mock_blink_stablesats_invoice_${Date.now()}`,
      paymentHash: fakeHash,
      paymentSecret: "mock-secret-stablesats",
    };
  }

  const mutation = `
    mutation LnUsdInvoiceCreate($input: LnUsdInvoiceCreateInput!) {
      lnUsdInvoiceCreate(input: $input) {
        invoice {
          paymentRequest
          paymentHash
          paymentSecret
          satoshis
        }
        errors {
          message
          code
        }
      }
    }
  `;

  const result = await executeBlinkGraphQL<{
    lnUsdInvoiceCreate: {
      invoice: BlinkInvoiceResult | null;
      errors: Array<{ message: string; code?: string }>;
    };
  }>(
    mutation,
    {
      input: {
        walletId: params.usdWalletId,
        amount: params.amountCents,
        memo: params.memo || `Recarga Tesorería Stablesats ($${(params.amountCents / 100).toFixed(2)} USD)`,
      },
    },
    params.overrideApiKey
  );

  if (result.errors?.length) {
    throw new Error(result.errors.map((e) => e.message).join("; "));
  }

  const payload = result.data?.lnUsdInvoiceCreate;
  if (payload?.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join("; "));
  }

  if (!payload?.invoice) {
    throw new Error("Blink no devolvió la factura USD solicitada.");
  }

  return payload.invoice;
}

/**
 * Convierte saldo de nuestra propia billetera BTC en Blink hacia nuestra billetera Stablesats (USD)
 * en caso de que el usuario haya recargado satoshis en su wallet BTC y se necesite completar Stablesats USD.
 */
export async function convertBlinkBtcWalletToStablesatsUsd(params: {
  btcWalletId: string;
  usdWalletId: string;
  amountUsdCents: number;
  memo?: string;
}): Promise<BlinkPaymentResult> {
  const mode = getPaymentMode();
  if (mode === "mock") {
    return { status: "SUCCESS", errors: [], mode: "mock" };
  }

  const usdInvoice = await createStablesatsUsdInvoice({
    usdWalletId: params.usdWalletId,
    amountCents: params.amountUsdCents,
    memo: params.memo || `Conversión interna BTC -> Stablesats ($${(params.amountUsdCents / 100).toFixed(2)} USD)`,
  });

  return payLightningInvoiceFromStablesats({
    usdWalletId: params.btcWalletId,
    paymentRequest: usdInvoice.paymentRequest,
    memo: params.memo || "Conversión interna BTC -> Stablesats USD",
  });
}

/**
 * Estima la comisión de red Lightning antes de pagar una factura BOLT11.
 */
export async function probeLightningFeeFromUsd(params: {
  usdWalletId: string;
  paymentRequest: string;
  overrideMode?: PaymentMode;
  overrideApiKey?: string;
}): Promise<{ feeUsdCents: number; mode: PaymentMode }> {
  const mode = getPaymentMode(params.overrideMode);

  if (mode === "mock") {
    return { feeUsdCents: 0, mode: "mock" };
  }

  const mutation = `
    mutation LnInvoiceFeeProbe($input: LnInvoiceFeeProbeInput!) {
      lnInvoiceFeeProbe(input: $input) {
        amount
        errors {
          message
          code
        }
      }
    }
  `;

  const result = await executeBlinkGraphQL<{
    lnInvoiceFeeProbe: {
      amount: number | null;
      errors: Array<{ message: string; code?: string }>;
    };
  }>(
    mutation,
    {
      input: {
        walletId: params.usdWalletId,
        paymentRequest: params.paymentRequest.trim(),
      },
    },
    params.overrideApiKey
  );

  const probe = result.data?.lnInvoiceFeeProbe;
  if (probe?.errors?.length) {
    throw new Error(probe.errors.map((e) => e.message).join("; "));
  }

  return {
    feeUsdCents: probe?.amount ?? 0,
    mode: "production",
  };
}

/**
 * Envía el pago de una factura Lightning (generada por Chivo Wallet en El Salvador)
 * descontando directamente de nuestra billetera Stablesats USD en Blink.
 */
export async function payLightningInvoiceFromStablesats(params: {
  usdWalletId: string;
  paymentRequest: string;
  memo?: string;
  overrideMode?: PaymentMode;
  overrideApiKey?: string;
}): Promise<BlinkPaymentResult> {
  const mode = getPaymentMode(params.overrideMode);

  if (mode === "mock") {
    return {
      status: "SUCCESS",
      errors: [],
      mode: "mock",
    };
  }

  const mutation = `
    mutation LnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
      lnInvoicePaymentSend(input: $input) {
        status
        errors {
          message
          code
        }
      }
    }
  `;

  const result = await executeBlinkGraphQL<{
    lnInvoicePaymentSend: {
      status: "SUCCESS" | "PENDING" | "FAILURE" | "ALREADY_PAID" | null;
      errors: Array<{ message: string; code?: string }>;
    };
  }>(
    mutation,
    {
      input: {
        walletId: params.usdWalletId,
        paymentRequest: params.paymentRequest.trim(),
        memo: params.memo || "Pago de Remesa a Chivo Wallet",
      },
    },
    params.overrideApiKey
  );

  if (result.errors?.length) {
    return {
      status: "FAILURE",
      errors: result.errors.map((e) => ({ message: e.message, code: e.extensions?.code })),
      mode: "production",
    };
  }

  const sendResult = result.data?.lnInvoicePaymentSend;
  return {
    status: sendResult?.status || "FAILURE",
    errors: sendResult?.errors || [],
    mode: "production",
  };
}
