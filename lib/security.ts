import { createHash, randomBytes } from "node:crypto";
export const random = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function safeReturn(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return "/";
  const url = new URL(value, "https://portal.invalid");
  if (
    url.origin !== "https://portal.invalid" ||
    url.hash ||
    url.pathname.startsWith("/api/")
  )
    return "/";
  return url.pathname + url.search;
}
export function assertOrigin(request: Request, origin: string) {
  if (request.headers.get("origin") !== origin) throw new Error("csrf");
}

export async function readJson(
  source: Request | Response,
  limit = 4096,
): Promise<unknown> {
  if (!source.body) throw new Error("bad_request");
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error("bad_request");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
