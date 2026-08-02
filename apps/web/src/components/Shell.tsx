'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
const nav = [
  ['/', '总览'],
  ['/assistants', '助手'],
  ['/knowledge-bases', '知识库'],
  ['/retrieval', '检索调试'],
  ['/chat', '对话'],
  ['/agent-runs', 'Agent 运行'],
  ['/approvals', '审批中心'],
  ['/workflows', 'Workflow Trace'],
  ['/models', '模型供应商'],
  ['/api-keys', 'API Key'],
  ['/usage', '用量与成本'],
  ['/members', '成员与角色'],
  ['/audit', '审计日志'],
];
export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Enterprise AI Hub</div>
        <nav className="nav">
          {nav.map(([href, label]) => (
            <Link key={href} href={href!}>
              {label}
            </Link>
          ))}
        </nav>
        <button
          onClick={async () => {
            await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
            localStorage.clear();
            router.push('/login');
          }}
        >
          退出登录
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
