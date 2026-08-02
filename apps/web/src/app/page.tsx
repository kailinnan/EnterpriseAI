'use client';
import { useEffect, useState } from 'react';
import { Shell } from '../components/Shell';
const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(
  '/api/v1',
  '',
);
export default function Home() {
  const [health, setHealth] = useState<Record<string, boolean>>({});
  useEffect(() => {
    fetch(`${apiOrigin}/health/ready`)
      .then((r) => r.json())
      .then((x: { checks: Record<string, boolean> }) => setHealth({ api: true, ...x.checks }))
      .catch(() => setHealth({ api: false }));
  }, []);
  return (
    <Shell>
      <h1>平台总览</h1>
      <p className="muted">
        阶段 0–11：多租户 RAG、受控 Agent、审批工作流、配额、安全评估与可观测性
      </p>
      <div className="grid">
        {['api', 'postgres', 'redis', 'minio'].map((name) => (
          <div className="card" key={name}>
            <h3>{name.toUpperCase()}</h3>
            <span className="status">{health[name] ? '正常' : '检查中 / 不可用'}</span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
