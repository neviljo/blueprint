/**
 * Web Crypto API helpers for AES-GCM 128-bit E2E Encryption
 * Matching official Excalidraw zero-knowledge specification.
 */

function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64ToBuffer(base64: string): ArrayBuffer {
  let str = base64.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function generateKey(): Promise<string> {
  const key = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 128 },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await window.crypto.subtle.exportKey("raw", key);
  return bufferToBase64(exported);
}

export async function importKey(keyStr: string): Promise<CryptoKey | null> {
  if (!keyStr) return null;
  try {
    const rawKey = base64ToBuffer(keyStr);
    return await window.crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM", length: 128 },
      false,
      ["encrypt", "decrypt"]
    );
  } catch (err) {
    console.error("Failed to import crypto key:", err);
    return null;
  }
}

export async function encryptData(
  key: CryptoKey | null,
  data: unknown
): Promise<string> {
  const jsonStr = JSON.stringify(data);
  if (!key) return jsonStr;

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(jsonStr);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  return JSON.stringify({
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
  });
}

export async function decryptData<T = any>(
  key: CryptoKey | null,
  encryptedStr: string
): Promise<T | null> {
  if (!key) {
    try {
      return JSON.parse(encryptedStr) as T;
    } catch {
      return null;
    }
  }

  try {
    const { iv, ciphertext } = JSON.parse(encryptedStr);
    if (!iv || !ciphertext) {
      // Fallback if raw unencrypted string
      return JSON.parse(encryptedStr) as T;
    }
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(base64ToBuffer(iv)) },
      key,
      base64ToBuffer(ciphertext)
    );
    const decoded = new TextDecoder().decode(decrypted);
    return JSON.parse(decoded) as T;
  } catch (err) {
    console.error("Failed to decrypt socket payload:", err);
    return null;
  }
}
