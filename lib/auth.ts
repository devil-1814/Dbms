import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE = "smart_emergency_session";
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 24) throw new Error("Set SESSION_SECRET (at least 24 characters) in .env.local");
  return value;
}
export function makeToken(user: { id: number; name: string; role: string }) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 1000 * 60 * 60 * 12 })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
export function verifyToken(token: string) {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = createHmac("sha256", secret()).update(payload).digest();
    const received = Buffer.from(signature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp < Date.now()) return null;
    return data as { id: number; name: string; role: string };
  } catch { return null; }
}
export async function currentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  return token ? verifyToken(token) : null;
}
export const sessionCookie = COOKIE;