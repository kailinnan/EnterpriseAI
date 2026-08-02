'use client';

import { useEffect, useState } from 'react';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';
type Call = {
  id: string;
  tool_name: string;
  description: string;
  side_effect_level: string;
  validated_input_json: unknown;
  requester_id: string;
  agent_reason: string | null;
  created_at?: string;
};

export default function Page() {
  const [items, setItems] = useState<Call[]>([]);
  const load = () => api<Call[]>('/tool-calls/pending').then(setItems);
  useEffect(() => {
    void load();
  }, []);
  async function decide(id: string, action: 'approve' | 'reject') {
    await api(`/tool-calls/${id}/${action}`, {
      method: 'POST',
      body: JSON.stringify({
        reason: action === 'approve' ? '已核对工具输入和业务影响' : '审批人拒绝本次操作',
      }),
    });
    void load();
  }
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Human in the Loop</div>
          <h1>审批中心</h1>
          <p>在 Agent 执行有副作用的业务动作前进行人工复核。</p>
        </div>
        <span className={items.length ? 'status warning' : 'status'}>{items.length} 项待处理</span>
      </div>
      {items.length === 0 && (
        <div className="empty-state approval-empty">
          <span className="empty-mark">✓</span>
          <strong>审批队列已清空</strong>目前没有等待处理的高风险工具调用。
        </div>
      )}
      <div className="approval-list">
        {items.map((item) => (
          <article className="card approval-card" key={item.id}>
            <div className="approval-top">
              <span className="tool-mark">{item.tool_name.slice(0, 2).toUpperCase()}</span>
              <div>
                <div className="row">
                  <h3>{item.tool_name}</h3>
                  <span className="status warning">{item.side_effect_level} SIDE EFFECT</span>
                </div>
                <p>{item.description}</p>
              </div>
              <span className="spacer" />
              <small className="muted">请求人 {item.requester_id.slice(0, 8)}…</small>
            </div>
            <div className="approval-body">
              <span className="metric-label">Agent 执行理由</span>
              <p>{item.agent_reason ?? '未提供额外理由'}</p>
              <span className="metric-label">已验证的执行参数</span>
              <pre>{JSON.stringify(item.validated_input_json, null, 2)}</pre>
            </div>
            <div className="approval-actions">
              <button className="danger-button" onClick={() => decide(item.id, 'reject')}>
                拒绝请求
              </button>
              <button onClick={() => decide(item.id, 'approve')}>批准并执行</button>
            </div>
          </article>
        ))}
      </div>
    </Shell>
  );
}
