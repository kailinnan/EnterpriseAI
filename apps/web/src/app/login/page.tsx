'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      localStorage.setItem('accessToken', result.accessToken);
      router.push('/');
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : '登录失败，请检查账号信息');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-visual">
        <div className="login-brand">
          <span className="brand-mark">E</span> Enterprise AI Hub
        </div>
        <div className="login-copy">
          <div className="eyebrow" style={{ color: '#79dbc5' }}>
            Knowledge · Agent · Workflow
          </div>
          <h1>把分散的企业知识，变成可靠的智能能力。</h1>
          <p>连接内部资料、模型和业务工具，在统一权限、审批与审计体系中构建企业级 AI 助手。</p>
        </div>
        <div className="login-features">
          <span>多租户隔离</span>
          <span>可信 RAG 引用</span>
          <span>受控工具审批</span>
          <span>全链路审计</span>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-card stack" onSubmit={submit}>
          <div className="eyebrow">Welcome back</div>
          <h2>登录工作空间</h2>
          <p>使用你的企业账号继续访问知识库和智能应用。</p>
          <label className="form-label">
            邮箱地址
            <input
              name="email"
              type="email"
              defaultValue="owner@example.com"
              autoComplete="email"
              required
            />
          </label>
          <label className="form-label">
            登录密码
            <input
              name="password"
              type="password"
              defaultValue="DevPassword123!"
              autoComplete="current-password"
              required
            />
          </label>
          {error && <div className="notice danger">{error}</div>}
          <button disabled={busy}>{busy ? '正在验证…' : '进入 Enterprise AI Hub'}</button>
          <div className="login-hint">
            <span>本地开发环境</span>
            <span>安全连接 · RBAC</span>
          </div>
        </form>
      </section>
    </div>
  );
}
