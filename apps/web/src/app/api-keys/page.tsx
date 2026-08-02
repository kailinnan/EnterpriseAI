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
const scopes = [
  ['agent:run', '运行受控 Agent'],
  ['agent:read', '读取 Agent Trace'],
  ['chat:write', '发起流式对话'],
  ['knowledge:read', '读取知识库'],
  ['usage:read', '查看用量数据'],
  ['data:read', '执行预定义只读查询'],
  ['product:read', '查询产品信息'],
  ['order:read', '查询订单状态'],
  ['http:read', '调用白名单 HTTP 工具'],
  ['ticket:write', '提交需审批的工单'],
  ['email:write', '提交需审批的邮件'],
] as const;

export default function Page() {
  const [items, setItems] = useState<Key[]>([]);
  const [created, setCreated] = useState('');
  const load = () => api<Key[]>('/api-keys').then(setItems);
  useEffect(() => {
    void load();
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await api<{ key: string }>('/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: form.get('name'), scopes: form.getAll('scopes') }),
    });
    setCreated(result.key);
    event.currentTarget.reset();
    void load();
  }
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Developer Access</div>
          <h1>API Key</h1>
          <p>为内部系统创建最小权限的程序化访问凭据。</p>
        </div>
        <span className="status neutral">
          {items.filter((item) => !item.revoked_at).length} ACTIVE
        </span>
      </div>
      <div className="grid-2">
        <form className="card stack" onSubmit={create}>
          <div className="card-header">
            <div>
              <h2>创建新 Key</h2>
              <p>原始密钥仅在创建成功后显示一次</p>
            </div>
          </div>
          <label className="form-label">
            Key 名称
            <input name="name" placeholder="例如：内部数据助手" required />
          </label>
          <div className="scope-grid">
            {scopes.map(([scope, description]) => (
              <label className="scope-option" key={scope}>
                <input type="checkbox" name="scopes" value={scope} />
                <span>
                  <strong>{scope}</strong>
                  <small>{description}</small>
                </span>
              </label>
            ))}
          </div>
          <button>生成 API Key</button>
        </form>
        <div className="card key-guide">
          <div className="card-header">
            <div>
              <h2>安全使用建议</h2>
              <p>保护企业应用的访问边界</p>
            </div>
          </div>
          <ol>
            <li>只选择业务实际需要的 scopes</li>
            <li>不要把密钥提交到 Git 或写入日志</li>
            <li>为不同调用方创建独立 Key</li>
            <li>定期撤销长期未使用的凭据</li>
          </ol>
        </div>
      </div>
      {created && (
        <div className="key-reveal">
          <span>
            <strong>请立即复制并安全保存</strong>
            <small>关闭页面后将无法再次查看完整 Key</small>
          </span>
          <code>{created}</code>
          <button className="secondary" onClick={() => navigator.clipboard.writeText(created)}>
            复制
          </button>
        </div>
      )}
      <div className="card-header" style={{ marginTop: 30 }}>
        <div>
          <h2>已创建的 Key</h2>
          <p>查看使用状态或撤销访问权限</p>
        </div>
      </div>
      {items.length ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>前缀</th>
              <th>权限范围</th>
              <th>最近使用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>{' '}
                  {item.revoked_at && <span className="status warning">已撤销</span>}
                </td>
                <td>
                  <code>{item.prefix}…</code>
                </td>
                <td>
                  <div className="tag-list">
                    {item.scopes.map((scope) => (
                      <span key={scope}>{scope}</span>
                    ))}
                  </div>
                </td>
                <td>
                  {item.last_used_at
                    ? new Date(item.last_used_at).toLocaleString('zh-CN')
                    : '尚未使用'}
                </td>
                <td>
                  <button
                    className="danger-button"
                    disabled={Boolean(item.revoked_at)}
                    onClick={() => api(`/api-keys/${item.id}`, { method: 'DELETE' }).then(load)}
                  >
                    撤销
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <strong>尚未创建 API Key</strong>创建后即可通过 Bearer Token 调用开放接口。
        </div>
      )}
    </Shell>
  );
}
