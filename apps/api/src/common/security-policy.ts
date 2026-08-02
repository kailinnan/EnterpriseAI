const injectionPatterns = [
  /ignore (all|previous) instructions/i,
  /忽略(以上|之前|系统)指令/i,
  /system prompt/i,
  /泄露.*密钥/i,
];
export const detectPromptInjection = (text: string) =>
  injectionPatterns.filter((x) => x.test(text)).map((x) => x.source);
export const redactSensitive = (value: string) =>
  value
    .replace(/(sk-|hub_)[A-Za-z0-9_-]{12,}/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
