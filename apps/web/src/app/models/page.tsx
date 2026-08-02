'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';
type Provider = { id: string; name: string; provider_type: string; enabled: boolean };
export default function Page() {
  const [items, setItems] = useState<Provider[]>([]);
  const [error, setError] = useState('');
  const load = () =>
    api<Provider[]>('/model-providers')
      .then(setItems)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    void load();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api('/model-providers', {
      method: 'POST',
      body: JSON.stringify({
        name: f.get('name'),
        providerType: f.get('type'),
        baseUrl: f.get('baseUrl') || undefined,
        apiKey: f.get('apiKey') || undefined,
      }),
    });
    load();
  }
  return (
    <Shell>
      <h1>模型供应商</h1>
      <form className="card row" onSubmit={submit}>
        <input name="name" placeholder="名称" required />
        <select name="type">
          <option value="mock">Mock（测试）</option>
          <option value="openai">OpenAI</option>
          <option value="openai-compatible">OpenAI Compatible</option>
        </select>
        <input name="baseUrl" placeholder="Base URL" />
        <input name="apiKey" type="password" placeholder="API Key（加密保存）" />
        <button>创建</button>
      </form>
      {error && <p className="danger">{error}</p>}
      {items.map((x) => (
        <div className="card row" key={x.id}>
          <strong>{x.name}</strong>
          <span>{x.provider_type}</span>
          <button
            onClick={() =>
              api(`/model-providers/${x.id}/test`, { method: 'POST' }).then((r) =>
                alert(JSON.stringify(r)),
              )
            }
          >
            测试连接
          </button>
        </div>
      ))}
    </Shell>
  );
}
