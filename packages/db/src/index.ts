import postgres from 'postgres';
export type Database = ReturnType<typeof postgres>;
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const toJsonValue = (value: unknown): JsonValue =>
  JSON.parse(JSON.stringify(value)) as JsonValue;
let instance: Database | undefined;
export const db = (): Database =>
  (instance ??= postgres(process.env.DATABASE_URL ?? 'postgresql://hub:hub@localhost:5432/hub', {
    max: 10,
  }));
export const closeDb = async (): Promise<void> => {
  if (instance) await instance.end();
  instance = undefined;
};
