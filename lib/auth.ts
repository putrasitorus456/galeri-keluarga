import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { AppError, MESSAGES } from "@/lib/errors";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifySessionToken,
} from "@/lib/session";

export {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifySessionToken,
} from "@/lib/session";

export async function getSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie() {
  assertSessionSecret();
  const token = await createSessionToken();
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function readPinHash() {
  const raw = process.env.APP_PIN_HASH?.trim();
  if (!raw) return null;
  if (raw.startsWith("base64:")) {
    try {
      const decoded = Buffer.from(raw.slice("base64:".length), "base64").toString(
        "utf8",
      );
      return decoded || null;
    } catch {
      return null;
    }
  }
  return raw;
}

export async function verifyPin(pin: string) {
  const hash = readPinHash();
  if (!hash || !pin) return false;
  try {
    return await bcrypt.compare(pin, hash);
  } catch {
    return false;
  }
}

export function isSafeNextPath(value: string | null) {
  if (!value) return false;
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

export function assertSessionSecret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new AppError("drive", MESSAGES.drive, 500);
  }
}
