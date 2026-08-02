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
  const [provider] =
    await tx`insert into model_providers(tenant_id,provider_type,name,enabled) values(${tenant.id},'mock','Development Mock',true) on conflict(tenant_id,name) do update set enabled=true returning id`;
  if (!provider) throw new Error('Mock provider seed failed');
  await tx`insert into model_configs(tenant_id,provider_id,model_name,capability_json,input_price,output_price,enabled) values(${tenant.id},${provider.id},'mock-chat',${tx.json({ capabilities: ['chat', 'embedding'], embeddingDimensions: 1536 })},0,0,true) on conflict(tenant_id,provider_id,model_name) do update set capability_json=excluded.capability_json,enabled=true`;
  await tx`insert into product_catalog(tenant_id,sku,name,description) values(${tenant.id},'DEMO-001','企业知识库 Agent','用于本地验收的示例产品') on conflict(tenant_id,sku) do update set name=excluded.name,description=excluded.description`;
  await tx`insert into business_orders(tenant_id,order_number,status,summary) values(${tenant.id},'ORDER-DEMO-001','processing','示例订单正在处理中') on conflict(tenant_id,order_number) do update set status=excluded.status,summary=excluded.summary,updated_at=now()`;
});
await closeDb();
