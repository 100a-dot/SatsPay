import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE_NAME,
  computeAdminToken,
  isAdminAuthenticated,
  verifyAdminPassword,
} from "@/lib/admin-auth";

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutos

const globalForAdminRateLimit = globalThis as unknown as {
  __satspayAdminLoginAttempts?: Map<string, { count: number; resetAt: number }>;
};

function getRateLimitMap() {
  if (!globalForAdminRateLimit.__satspayAdminLoginAttempts) {
    globalForAdminRateLimit.__satspayAdminLoginAttempts = new Map();
  }
  return globalForAdminRateLimit.__satspayAdminLoginAttempts;
}

export async function GET() {
  const authenticated = await isAdminAuthenticated();
  return NextResponse.json({ authenticated });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, password } = body as {
      action?: "login" | "logout";
      password?: string;
    };

    const cookieStore = await cookies();

    if (action === "logout") {
      cookieStore.delete(ADMIN_COOKIE_NAME);
      return NextResponse.json({ authenticated: false });
    }

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown-ip";

    const rateMap = getRateLimitMap();
    const now = Date.now();
    const currentEntry = rateMap.get(clientIp);

    if (currentEntry && now < currentEntry.resetAt && currentEntry.count >= MAX_LOGIN_ATTEMPTS) {
      const waitMinutes = Math.ceil((currentEntry.resetAt - now) / 60000);
      return NextResponse.json(
        {
          error: `Demasiados intentos fallidos. Acceso bloqueado temporalmente por ${waitMinutes} minutos.`,
        },
        { status: 429 }
      );
    }

    if (!password || !verifyAdminPassword(password)) {
      const nextCount =
        currentEntry && now < currentEntry.resetAt ? currentEntry.count + 1 : 1;
      rateMap.set(clientIp, {
        count: nextCount,
        resetAt: now + LOCKOUT_WINDOW_MS,
      });

      return NextResponse.json(
        { error: "Contraseña de administrador incorrecta." },
        { status: 401 }
      );
    }

    rateMap.delete(clientIp);

    const token = computeAdminToken(password);
    cookieStore.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 días
    });

    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json(
      { error: "Error procesando autenticación de administrador." },
      { status: 500 }
    );
  }
}
