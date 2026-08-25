import { NextResponse } from "next/server";
import {
  isSafeNextPath,
  setSessionCookie,
  verifyPin,
} from "@/lib/auth";
import { MESSAGES } from "@/lib/errors";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let pin = "";
  try {
    const body = (await request.json()) as { pin?: string };
    pin = typeof body.pin === "string" ? body.pin.trim() : "";
  } catch {
    return NextResponse.json(
      { error: "invalid_pin", message: MESSAGES.invalidPin },
      { status: 400 },
    );
  }

  const ok = await verifyPin(pin);
  if (!ok) {
    return NextResponse.json(
      { error: "invalid_pin", message: MESSAGES.invalidPin },
      { status: 401 },
    );
  }

  try {
    await setSessionCookie();
  } catch (err) {
    return errorResponse(err);
  }

  const nextParam = new URL(request.url).searchParams.get("next");
  return NextResponse.json({
    ok: true,
    next: isSafeNextPath(nextParam) ? nextParam : "/",
  });
}
