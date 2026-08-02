'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';
type Key = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
};
export default function Page() {
  const [items, setItems] = useState<Key[]>([]);
  const [created, setCreated] = useState('');
  const load = () => api<Key[]>('/api-keys').then(setItems);
  useEffect(() => {
    void load();
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const result = await api<{ key: string }>('/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: f.get('name'), scopes: f.getAll('scopes') }),
    });
    setCreated(result.key);
    load();
  }
  return (
    <Shell>
      <h1>API Key</h1>
      <form className="card stack" onSubmit={create}>
        <input name="name" placeholder="Key 名称" required />
        <label>
          <input type="checkbox" name="scopes" value="agent:run" /> agent:run
        </label>
        <label>
          <input type="checkbox" name="scopes" value="chat:write" /> chat:write
        </label>
        <label>
          <input type="checkbox" name="scopes" value="knowledge:read" /> knowledge:read
        </label>
        <label>
          <input type="checkbox" name="scopes" value="usage:read" /> usage:read
        </label>
        <button>创建</button>
      </form>
      {created && (
        <div className="card danger">
          <strong>仅显示一次：</strong>
          <code>{created}</code>
        </div>
      )}
      {items.map((x) => (
        <div className="card row" key={x.id}>
          <strong>{x.name}</strong>
          <code>{x.prefix}…</code>
          <span>{x.scopes.join(', ')}</span>
          <button onClick={() => api(`/api-keys/${x.id}`, { method: 'DELETE' }).then(load)}>
            撤销
          </button>
        </div>
      ))}
    </Shell>
  );
}
