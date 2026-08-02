'use client';
import { useEffect, useState } from 'react';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';
type Log = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  request_id: string;
  created_at: string;
};
export default function Page() {
  const [logs, setLogs] = useState<Log[]>([]);
  useEffect(() => {
    void api<Log[]>('/audit-logs').then(setLogs);
  }, []);
  return (
    <Shell>
      <h1>审计日志</h1>
      {logs.map((x) => (
        <div className="card row" key={x.id}>
          <strong>{x.action}</strong>
          <span>
            {x.resource_type}:{x.resource_id}
          </span>
          <code>{x.request_id}</code>
          <small>{new Date(x.created_at).toLocaleString()}</small>
        </div>
      ))}
    </Shell>
  );
}
