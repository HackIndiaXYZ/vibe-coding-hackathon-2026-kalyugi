import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // AES-256 requires 32 bytes key
const IV_LENGTH = 12;  // Recommended IV length for GCM is 12 bytes

/**
 * Retrieves the encryption key from the environment and validates it.
 * Key must be a 64-character hex string representing a 32-byte key.
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY environment variable is not defined.');
  }

  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters), got ${key.length} bytes.`);
  }

  return key;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns the result in the format: "ivHex:authTagHex:encryptedHex"
 */
export function encryptToken(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a cipher text string in the format "ivHex:authTagHex:encryptedHex" using AES-256-GCM.
 */
export function decryptToken(cipherText: string): string {
  const key = getEncryptionKey();
  const parts = cipherText.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid cipher text format. Expected ivHex:authTagHex:encryptedHex.');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
