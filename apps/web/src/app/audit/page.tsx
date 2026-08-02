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
      <div className="page-heading">
        <div>
          <div className="eyebrow">Security Timeline</div>
          <h1>审计日志</h1>
          <p>追踪租户内的身份认证、配置变更、审批与工具执行事件。</p>
        </div>
        <span className="status neutral">最近 {logs.length} 条</span>
      </div>
      {logs.length ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>事件</th>
              <th>资源</th>
              <th>Request ID</th>
              <th>发生时间</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>
                  <strong>{log.action}</strong>
                </td>
                <td>
                  <span className="status neutral">{log.resource_type}</span> {log.resource_id}
                </td>
                <td>
                  <code>{log.request_id.slice(0, 14)}…</code>
                </td>
                <td>{new Date(log.created_at).toLocaleString('zh-CN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <strong>暂无审计记录</strong>登录或执行管理操作后，事件会出现在这里。
        </div>
      )}
    </Shell>
  );
}
