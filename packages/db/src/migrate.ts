import { db, closeDb } from './index.js';
const sql = db();
await sql.file(
  new URL('../migrations/0001_initial.sql', import.meta.url).pathname.replace(/^\/(.:)/, '$1'),
);
await sql.file(
  new URL('../migrations/0002_agent_platform.sql', import.meta.url).pathname.replace(
    /^\/(.:)/,
    '$1',
  ),
);
await sql.file(
  new URL('../migrations/0003_completion.sql', import.meta.url).pathname.replace(/^\/(.:)/, '$1'),
);
await closeDb();
