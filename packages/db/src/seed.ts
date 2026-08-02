import argon2 from 'argon2';
import { db, closeDb } from './index.js';
if ((process.env.NODE_ENV ?? 'development') !== 'development')
  throw new Error('Seed is development-only');
const sql = db();
const passwordHash = await argon2.hash('DevPassword123!');
await sql.begin(async (tx) => {
  const [tenant] =
    await tx`insert into tenants(name,slug) values('Demo Enterprise','demo') on conflict(slug) do update set name=excluded.name returning id`;
  const [user] =
    await tx`insert into users(email,password_hash,display_name) values('owner@example.com',${passwordHash},'Demo Owner') on conflict(email) do update set display_name=excluded.display_name returning id`;
  if (!tenant || !user) throw new Error('Seed insert failed');
  await tx`insert into tenant_members(tenant_id,user_id,role) values(${tenant.id},${user.id},'owner') on conflict(tenant_id,user_id) do update set role='owner'`;
});
await closeDb();
