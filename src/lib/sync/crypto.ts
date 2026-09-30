// AES-256-GCM encryption for secrets at rest (MAL tokens, PKCE verifiers).
// Web Crypto only, so it runs in Node and in the Deno worker. Additional
// authenticated data binds each ciphertext to its purpose and owner, so a
// ciphertext copied to another user's row fails to decrypt.

const VERSION = "v1";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBase64Url(byteLength: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function importEncryptionKey(base64Key: string): Promise<CryptoKey> {
  const raw = fromBase64(base64Key.trim());
  if (raw.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(key: CryptoKey, plaintext: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(key: CryptoKey, payload: string, aad: string): Promise<string> {
  const [version, iv, data] = payload.split(".");
  if (version !== VERSION || !iv || !data) throw new Error("Unsupported ciphertext format");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) as BufferSource, additionalData: new TextEncoder().encode(aad) },
    key,
    fromBase64(data) as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison for shared secrets. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export const secretPurpose = {
  malAccess: (userId: string) => `mal_access:${userId}`,
  malRefresh: (userId: string) => `mal_refresh:${userId}`,
  pkce: (userId: string, stateHash: string) => `pkce:${userId}:${stateHash}`,
};
