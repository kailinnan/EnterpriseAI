'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const sections = [
  {
    label: '工作空间',
    items: [
      ['/', '总览', '⌂'],
      ['/assistants', '智能助手', 'A'],
      ['/knowledge-bases', '企业知识库', 'K'],
      ['/chat', '知识库对话', 'C'],
    ],
  },
  {
    label: '智能编排',
    items: [
      ['/retrieval', '检索调试', 'R'],
      ['/agent-runs', 'Agent 运行', 'G'],
      ['/approvals', '审批中心', '✓'],
      ['/workflows', 'Workflow Trace', 'W'],
    ],
  },
  {
    label: '平台管理',
    items: [
      ['/models', '模型供应商', 'M'],
      ['/api-keys', 'API Key', '⌘'],
      ['/usage', '用量与成本', 'U'],
      ['/members', '成员与角色', 'P'],
      ['/audit', '审计日志', 'L'],
    ],
  },
] as const;

const pageMeta = new Map<string, string>(
  sections.flatMap((section) => section.items.map(([href, label]) => [href, label])),
);

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState<
    { id: string; name: string; slug: string; role: string }[]
  >([]);
  const [currentTenantId, setCurrentTenantId] = useState('');
  const title = pageMeta.get(pathname) ?? 'Enterprise AI Hub';

  useEffect(() => {
    Promise.all([
      api<{ id: string; name: string; slug: string; role: string }[]>('/tenants'),
      api<{ id: string }>('/tenants/current'),
    ]).then(([items, current]) => {
      setTenants(items);
      setCurrentTenantId(current.id);
    });
  }, []);

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <Link className="brand" href="/" onClick={() => setOpen(false)}>
            <span className="brand-mark">E</span>
            <span>
              <strong>Enterprise AI</strong>
              <small>Knowledge Hub</small>
            </span>
          </Link>
          <button
            className="icon-button sidebar-close"
            onClick={() => setOpen(false)}
            aria-label="关闭导航"
          >
            ×
          </button>
        </div>

        <label className="workspace-switcher">
          <span className="workspace-avatar">DE</span>
          <span>
            <small>当前工作空间</small>
            <select
              aria-label="切换企业工作空间"
              value={currentTenantId}
              onChange={async (event) => {
                const tenantId = event.target.value;
                const result = await api<{ accessToken: string }>(`/tenants/${tenantId}/switch`, {
                  method: 'POST',
                });
                localStorage.setItem('accessToken', result.accessToken);
                window.location.href = '/';
              }}
            >
              {tenants.map((tenant) => (
                <option value={tenant.id} key={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </span>
          <span className="chevron">⌄</span>
        </label>

        <nav className="nav" aria-label="管理后台导航">
          {sections.map((section) => (
            <div className="nav-section" key={section.label}>
              <div className="nav-label">{section.label}</div>
              {section.items.map(([href, label, icon]) => {
                const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <Link
                    className={active ? 'active' : ''}
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                  >
                    <span className="nav-icon">{icon}</span>
                    <span>{label}</span>
                    {label === '审批中心' && <span className="nav-badge">!</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="environment-pill">
            <i /> Development
          </div>
          <button
            className="logout-button"
            onClick={async () => {
              await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
              localStorage.clear();
              router.push('/login');
            }}
          >
            <span>↪</span> 退出登录
          </button>
        </div>
      </aside>

      {open && (
        <button
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
          aria-label="关闭导航遮罩"
        />
      )}

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button menu-button"
              onClick={() => setOpen(true)}
              aria-label="打开导航"
            >
              ☰
            </button>
            <div>
              <small>Enterprise AI Hub</small>
              <strong>{title}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <Link className="docs-link" href="http://localhost:3001/api/docs" target="_blank">
              API 文档 ↗
            </Link>
            <span className="live-indicator">
              <i /> 本地环境
            </span>
            <span className="user-avatar" title="Demo Owner">
              DO
            </span>
          </div>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
