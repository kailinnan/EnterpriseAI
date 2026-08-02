'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';
type Assistant = { id: string; name: string; description: string; status: string };
export default function Page() {
  const [items, setItems] = useState<Assistant[]>([]);
  const load = () => api<Assistant[]>('/assistants').then(setItems);
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
        knowledgeBaseIds: String(f.get('kbIds'))
          .split(',')
          .map((x) => x.trim()),
        temperature: 0.2,
        maxOutputTokens: 1024,
        retrievalConfig: { topK: 8 },
      }),
    });
    load();
  }
  return (
    <Shell>
      <h1>助手构建器 / 测试台</h1>
      <form className="card stack" onSubmit={submit}>
        <input name="name" placeholder="助手名称" required />
        <input name="description" placeholder="说明" />
        <textarea
          name="prompt"
          placeholder="System Prompt"
          defaultValue="你是企业知识库助手。"
          required
        />
        <input name="modelId" placeholder="模型配置 UUID" required />
        <input name="kbIds" placeholder="知识库 UUID，多个用逗号分隔" />
        <button>创建助手</button>
      </form>
      {items.map((x) => (
        <div className="card row" key={x.id}>
          <strong>{x.name}</strong>
          <span>{x.description}</span>
          <span className="status">{x.status}</span>
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
    </Shell>
  );
}
