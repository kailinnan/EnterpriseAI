import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const encryptSecret = (value: string, keyBase64: string): string => {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('MODEL_ENCRYPTION_KEY must decode to 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((x) => x.toString('base64url')).join('.');
};
export const decryptSecret = (value: string, keyBase64: string): string => {
  const [ivRaw, tagRaw, dataRaw] = value.split('.');
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error('Invalid encrypted secret');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keyBase64, 'base64'),
    Buffer.from(ivRaw, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};
