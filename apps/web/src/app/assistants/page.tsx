'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';
type Assistant = { id: string; name: string; description: string; status: string };
type Model = { id: string; model_name: string; capability_json: { capabilities?: string[] } };
type KnowledgeBase = { id: string; name: string };
export default function Page() {
  const [items, setItems] = useState<Assistant[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const load = () =>
    Promise.all([
      api<Assistant[]>('/assistants'),
      api<Model[]>('/models'),
      api<KnowledgeBase[]>('/knowledge-bases'),
    ]).then(([assistants, modelConfigs, kbs]) => {
      setItems(assistants);
      setModels(
        modelConfigs.filter((model) => model.capability_json.capabilities?.includes('chat')),
      );
      setKnowledgeBases(kbs);
    });
  useEffect(() => {
    void load();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api('/assistants', {
      method: 'POST',
      body: JSON.stringify({
        name: f.get('name'),
        description: f.get('description'),
        systemPrompt: f.get('prompt'),
        modelConfigId: f.get('modelId'),
        knowledgeBaseIds: f.getAll('knowledgeBaseIds'),
        temperature: 0.2,
        maxOutputTokens: 1024,
        retrievalConfig: { topK: 8 },
      }),
    });
    load();
  }
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Assistant Studio</div>
          <h1>智能助手</h1>
          <p>组合模型、系统指令和企业知识，构建专属业务助手。</p>
        </div>
        <span className="status neutral">{items.length} ASSISTANTS</span>
      </div>
      <form className="card stack" onSubmit={submit}>
        <input name="name" placeholder="助手名称" required />
        <input name="description" placeholder="说明" />
        <textarea
          name="prompt"
          placeholder="System Prompt"
          defaultValue="你是企业知识库助手。"
          required
        />
        <select name="modelId" required defaultValue="">
          <option value="" disabled>
            选择 Chat 模型
          </option>
          {models.map((model) => (
            <option value={model.id} key={model.id}>
              {model.model_name}
            </option>
          ))}
        </select>
        <div className="scope-grid">
          {knowledgeBases.map((kb) => (
            <label className="scope-option" key={kb.id}>
              <input type="checkbox" name="knowledgeBaseIds" value={kb.id} />
              <span>
                <strong>{kb.name}</strong>
                <small>绑定企业知识库</small>
              </span>
            </label>
          ))}
        </div>
        <button>创建助手</button>
      </form>
      {items.map((x) => (
        <div className="card row" key={x.id}>
          <strong>{x.name}</strong>
          <span>{x.description}</span>
          <span className="status">{x.status}</span>
          <span className="spacer" />
          {x.status !== 'published' && (
            <button
              className="secondary"
              onClick={() => api(`/assistants/${x.id}/publish`, { method: 'POST' }).then(load)}
            >
              发布
            </button>
          )}
          <button
            onClick={() =>
              api<{ id: string }>('/conversations', {
                method: 'POST',
                body: JSON.stringify({ assistantId: x.id }),
              }).then((c) => (location.href = `/chat?conversation=${c.id}`))
            }
          >
            开始测试
          </button>
        </div>
      ))}
      {items.length === 0 && (
        <div className="empty-state">
          <strong>尚未创建助手</strong>填写上方配置，创建后即可进入知识库对话测试。
        </div>
      )}
    </Shell>
  );
}
