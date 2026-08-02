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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('/tenants/current/members', {
      method: 'POST',
      body: JSON.stringify({ email: form.get('email'), role: form.get('role') }),
    });
    event.currentTarget.reset();
    void load();
  }
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Team & Access</div>
          <h1>成员与角色</h1>
          <p>管理工作空间成员及其数据和操作权限。</p>
        </div>
        <span className="status neutral">{items.length} MEMBERS</span>
      </div>
      <form className="card row" onSubmit={submit}>
        <input name="email" type="email" placeholder="已注册用户邮箱" required />
        <select name="role" defaultValue="viewer">
          <option>viewer</option>
          <option>member</option>
          <option>editor</option>
          <option>admin</option>
        </select>
        <button>添加成员</button>
      </form>
      <table className="data-table">
        <thead>
          <tr>
            <th>成员</th>
            <th>邮箱</th>
            <th>角色</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {items.map((member) => (
            <tr key={member.id}>
              <td>
                <div className="member-cell">
                  <span className="member-avatar">
                    {member.display_name.slice(0, 2).toUpperCase()}
                  </span>
                  <strong>{member.display_name}</strong>
                </div>
              </td>
              <td>{member.email}</td>
              <td>
                <span className="status neutral">{member.role}</span>
              </td>
              <td>
                <span className="status">活跃</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
