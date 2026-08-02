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
      body: JSON.stringify({ reason: action === 'approve' ? '已核对影响' : '审批人拒绝' }),
    });
    load();
  }
  return (
    <Shell>
      <h1>审批中心</h1>
      {items.length === 0 && <div className="card muted">暂无待审批工具调用</div>}
      {items.map((x) => (
        <div className="card" key={x.id}>
          <h3>
            {x.tool_name} <span className="status">{x.side_effect_level}</span>
          </h3>
          <p>{x.description}</p>
          <pre>{JSON.stringify(x.validated_input_json, null, 2)}</pre>
          <div className="row">
            <button onClick={() => decide(x.id, 'approve')}>批准</button>
            <button onClick={() => decide(x.id, 'reject')}>拒绝</button>
          </div>
        </div>
      ))}
    </Shell>
  );
}
