import { NextResponse } from "next/server";
import { AppError, MESSAGES } from "@/lib/errors";

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    if (err.code === "drive" || err.code === "config") {
      console.error(`[${err.code}] ${err.message}`);
    }
    return NextResponse.json(
      { error: err.code, message: err.message },
      { status: err.status },
    );
  }

  console.error(err);
  return NextResponse.json(
    { error: "drive", message: MESSAGES.drive },
    { status: 502 },
  );
}

export function unauthorized() {
  return NextResponse.json(
    { error: "unauthorized", message: MESSAGES.unauthorized },
    { status: 401 },
  );
}

export function cachedJson(data: unknown, maxAge = 20) {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": `private, max-age=${maxAge}, stale-while-revalidate=600`,
    },
  });
}
