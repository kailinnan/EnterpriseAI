'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';
type Member = { id: string; email: string; display_name: string; role: string };
export default function Page() {
  const [items, setItems] = useState<Member[]>([]);
  const load = () => api<Member[]>('/tenants/current/members').then(setItems);
  useEffect(() => {
    void load();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api('/tenants/current/members', {
      method: 'POST',
      body: JSON.stringify({ email: f.get('email'), role: f.get('role') }),
    });
    load();
  }
  return (
    <Shell>
      <h1>成员与角色</h1>
      <form className="card row" onSubmit={submit}>
        <input name="email" type="email" placeholder="已注册用户邮箱" required />
        <select name="role">
          <option>viewer</option>
          <option>member</option>
          <option>editor</option>
          <option>admin</option>
        </select>
        <button>添加成员</button>
      </form>
      {items.map((x) => (
        <div className="card row" key={x.id}>
          <strong>{x.display_name}</strong>
          <span>{x.email}</span>
          <span className="status">{x.role}</span>
        </div>
      ))}
    </Shell>
  );
}
