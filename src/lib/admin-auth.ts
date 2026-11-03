import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getAdminPassword } from "./blink";

export const ADMIN_COOKIE_NAME = "remesas_sv_admin_token";

function getServerSigningSecret(): string {
  const blinkSecret = (process.env.BLINK_API_KEY || "").trim();
  const wompiSecret = (process.env.WOMPI_API_SECRET || "").trim();
  return `remesas-sv-hmac-v2:${blinkSecret}:${wompiSecret}`;
}

function safeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function computeAdminToken(password: string): string {
  return createHmac("sha256", getServerSigningSecret())
    .update(`admin-auth:${password}`)
    .digest("hex");
}

export function verifyAdminPassword(inputPassword: string): boolean {
  const expected = getAdminPassword();
  return safeCompareStrings(inputPassword, expected);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!tokenCookie) return false;
    const expectedToken = computeAdminToken(getAdminPassword());
    return safeCompareStrings(tokenCookie, expectedToken);
  } catch {
    return false;
  }
}
