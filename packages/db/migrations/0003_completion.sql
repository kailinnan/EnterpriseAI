ALTER TABLE assistants ADD COLUMN IF NOT EXISTS agent_config_json jsonb NOT NULL DEFAULT '{"maxSteps":8,"maxRuntimeMs":60000}';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS prompt_version text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS retrieval_json jsonb NOT NULL DEFAULT '[]';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS first_token_ms int;
ALTER TABLE tool_calls ADD COLUMN IF NOT EXISTS agent_reason text;

CREATE TABLE IF NOT EXISTS product_catalog(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  metadata_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,sku)
);

CREATE TABLE IF NOT EXISTS business_orders(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
  order_number text NOT NULL,
  status text NOT NULL,
  summary text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,order_number)
);

CREATE TABLE IF NOT EXISTS email_outbox(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
  recipient text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  idempotency_key text NOT NULL,
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS product_catalog_tenant_sku_idx ON product_catalog(tenant_id,sku);
CREATE INDEX IF NOT EXISTS business_orders_tenant_number_idx ON business_orders(tenant_id,order_number);
CREATE INDEX IF NOT EXISTS email_outbox_tenant_status_idx ON email_outbox(tenant_id,status,created_at);

-- Composite tenant keys add a database-level backstop to the application tenant filters.
CREATE UNIQUE INDEX IF NOT EXISTS model_configs_id_tenant_uq ON model_configs(id,tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_bases_id_tenant_uq ON knowledge_bases(id,tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS documents_id_tenant_uq ON documents(id,tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS assistants_id_tenant_uq ON assistants(id,tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_id_tenant_uq ON conversations(id,tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agent_runs_id_tenant_uq ON agent_runs(id,tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS tool_definitions_id_tenant_uq ON tool_definitions(id,tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_id_tenant_uq ON workflow_runs(id,tenant_id);

DO $$ BEGIN
  ALTER TABLE knowledge_bases ADD CONSTRAINT knowledge_bases_model_tenant_fk FOREIGN KEY (embedding_model_config_id,tenant_id) REFERENCES model_configs(id,tenant_id) ON DELETE SET NULL (embedding_model_config_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE documents ADD CONSTRAINT documents_kb_tenant_fk FOREIGN KEY (knowledge_base_id,tenant_id) REFERENCES knowledge_bases(id,tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE document_chunks ADD CONSTRAINT chunks_document_tenant_fk FOREIGN KEY (document_id,tenant_id) REFERENCES documents(id,tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE assistants ADD CONSTRAINT assistants_model_tenant_fk FOREIGN KEY (model_config_id,tenant_id) REFERENCES model_configs(id,tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE conversations ADD CONSTRAINT conversations_assistant_tenant_fk FOREIGN KEY (assistant_id,tenant_id) REFERENCES assistants(id,tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE messages ADD CONSTRAINT messages_conversation_tenant_fk FOREIGN KEY (conversation_id,tenant_id) REFERENCES conversations(id,tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE tool_calls ADD CONSTRAINT tool_calls_agent_tenant_fk FOREIGN KEY (agent_run_id,tenant_id) REFERENCES agent_runs(id,tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE tool_calls ADD CONSTRAINT tool_calls_definition_tenant_fk FOREIGN KEY (tool_definition_id,tenant_id) REFERENCES tool_definitions(id,tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE workflow_node_runs ADD CONSTRAINT workflow_nodes_run_tenant_fk FOREIGN KEY (workflow_run_id,tenant_id) REFERENCES workflow_runs(id,tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
