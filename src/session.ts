// Turnstile siteverify plus HMAC session tokens (SPEC: one Turnstile solve
// authorizes one parse session; the token is unforgeable, short lived, and
// deliberately not IP bound because phones change IPs mid-session).

import type { Env } from "./worker";

const TOKEN_TTL_SECONDS = 600;
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): Uint8Array | null {
  try {
    const padded = s.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usages: ("sign" | "verify")[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

export async function verifyTurnstile(env: Env, token: string, remoteIp: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) {
    // Local development before Tom's Turnstile preflight (DEPLOY.md). The
    // production deploy carries the secret, so this branch never runs there.
    console.log(JSON.stringify({ event: "turnstile_skipped", reason: "no_secret_configured" }));
    return true;
  }
  const form = new URLSearchParams();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);
  // idempotency_key lets a network-level retry of this verification succeed
  // instead of being rejected as a token replay.
  form.set("idempotency_key", crypto.randomUUID());

  const resp = await fetch(SITEVERIFY_URL, { method: "POST", body: form });
  if (!resp.ok) return false;
  const result = (await resp.json()) as { success?: boolean };
  return result.success === true;
}

export interface SessionTokenPayload {
  exp: number;
  jti: string;
}

export async function mintSessionToken(env: Env): Promise<{ token: string; exp: number }> {
  if (!env.SESSION_HMAC_SECRET) {
    throw new Error("SESSION_HMAC_SECRET is not set (see docs/DEPLOY.md and .dev.vars)");
  }
  const payload: SessionTokenPayload = {
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    jti: crypto.randomUUID(),
  };
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const key = await hmacKey(env.SESSION_HMAC_SECRET, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, payloadBytes));
  return {
    token: `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(sig)}`,
    exp: payload.exp,
  };
}

// Returns the payload when the token is authentic and unexpired, else null.
// Signature checking goes through crypto.subtle.verify (constant time),
// never string comparison.
export async function verifySessionToken(env: Env, token: string): Promise<SessionTokenPayload | null> {
  if (!env.SESSION_HMAC_SECRET || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const payloadBytes = base64UrlDecode(token.slice(0, dot));
  const sigBytes = base64UrlDecode(token.slice(dot + 1));
  if (!payloadBytes || !sigBytes) return null;

  const key = await hmacKey(env.SESSION_HMAC_SECRET, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes as BufferSource, payloadBytes as BufferSource);
  if (!valid) return null;

  let payload: SessionTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionTokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || typeof payload.jti !== "string") return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}
