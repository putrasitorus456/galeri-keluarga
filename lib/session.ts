import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "fk_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export function getSessionSecretBytes() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

export async function createSessionToken() {
  const secret = getSessionSecretBytes();
  if (!secret) {
    throw new Error("SESSION_SECRET tidak valid");
  }
  return new SignJWT({ sub: "family" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret);
}

export async function verifySessionToken(token: string) {
  const secret = getSessionSecretBytes();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.sub !== "family") return null;
    return payload;
  } catch {
    return null;
  }
}
