import type { SecretProtector } from "./types.js";

const PREFIX = "v1";

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}

export class AesGcmSecretProtector implements SecretProtector {
  private readonly keyBytes: Uint8Array;

  constructor(encodedMasterKey: string) {
    this.keyBytes = decodeBase64Url(encodedMasterKey);
    if (this.keyBytes.byteLength !== 32) {
      throw new Error("CONNECTOR_MASTER_KEY must decode to exactly 32 bytes");
    }
  }

  private async key(): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", asArrayBuffer(this.keyBytes), "AES-GCM", false, ["encrypt", "decrypt"]);
  }

  async seal(secret: string, context: string): Promise<string> {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: asArrayBuffer(nonce),
        additionalData: asArrayBuffer(new TextEncoder().encode(context)),
      },
      await this.key(),
      new TextEncoder().encode(secret),
    );
    return `${PREFIX}.${encodeBase64Url(nonce)}.${encodeBase64Url(new Uint8Array(ciphertext))}`;
  }

  async open(sealedSecret: string, context: string): Promise<string> {
    const [prefix, encodedNonce, encodedCiphertext, extra] = sealedSecret.split(".");
    if (prefix !== PREFIX || !encodedNonce || !encodedCiphertext || extra !== undefined) {
      throw new Error("Unsupported sealed connector secret");
    }
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asArrayBuffer(decodeBase64Url(encodedNonce)),
        additionalData: asArrayBuffer(new TextEncoder().encode(context)),
      },
      await this.key(),
      asArrayBuffer(decodeBase64Url(encodedCiphertext)),
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  }
}

export function generateConnectorSecret(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function connectorSecretContext(connectorId: string, version: number): string {
  return `neoloop-connector-secret-v1:${connectorId}:${version}`;
}
