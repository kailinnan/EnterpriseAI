'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';
type KB = { id: string; name: string; description: string; status: string };
export default function Page() {
  const [items, setItems] = useState<KB[]>([]);
  const load = () => api<KB[]>('/knowledge-bases').then(setItems);
  useEffect(() => {
    void load();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api('/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify({ name: f.get('name'), description: f.get('description') }),
    });
    load();
  }
  return (
    <Shell>
      <h1>知识库</h1>
      <form className="card row" onSubmit={submit}>
        <input name="name" placeholder="知识库名称" required />
        <input name="description" placeholder="说明" />
        <button>创建</button>
      </form>
      <div className="grid">
        {items.map((x) => (
          <Link className="card" href={`/knowledge-bases/${x.id}`} key={x.id}>
            <h3>{x.name}</h3>
            <p>{x.description}</p>
            <span className="status">{x.status}</span>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
