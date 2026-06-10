import { NextResponse } from "next/server";
import {
  BETA_COOKIE_MAX_AGE_SECONDS,
  BETA_COOKIE_NAME,
  deriveSessionToken,
  isGateActive,
  safeEqual,
} from "@/lib/auth";

export const runtime = "edge";

export async function POST(req: Request) {
  if (!isGateActive()) {
    return NextResponse.json(
      { error: "Gate is not active. Login is not required." },
      { status: 400 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const submitted = String(body?.password ?? "");
  const expected = String(process.env.BETA_PASSWORD ?? "");
  if (!submitted || !safeEqual(submitted, expected)) {
    // Constant-time-ish failure delay so password length doesn't leak via timing.
    await new Promise((r) => setTimeout(r, 250));
    return NextResponse.json(
      { error: "Wrong password." },
      { status: 401 },
    );
  }

  const token = await deriveSessionToken(expected);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: BETA_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: BETA_COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}
