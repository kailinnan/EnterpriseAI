'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
export default function Login() {
  const router = useRouter();
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const r = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      localStorage.setItem('accessToken', r.accessToken);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    }
  }
  return (
    <div className="login card">
      <h1>登录 Enterprise AI Hub</h1>
      <form className="stack" onSubmit={submit}>
        <input name="email" type="email" defaultValue="owner@example.com" required />
        <input name="password" type="password" defaultValue="DevPassword123!" required />
        <button>登录</button>
        {error && <div className="danger">{error}</div>}
      </form>
    </div>
  );
}
