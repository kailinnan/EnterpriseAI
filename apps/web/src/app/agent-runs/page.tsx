'use client';
import { FormEvent, useState } from 'react';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';
export default function Page() {
  const [result, setResult] = useState<unknown>();
  async function run(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setResult(
      await api('/agent-runs', {
        method: 'POST',
        body: JSON.stringify({
          prompt: f.get('prompt'),
          toolName: f.get('toolName') || undefined,
          toolInput: f.get('toolInput') ? JSON.parse(String(f.get('toolInput'))) : {},
        }),
      }),
    );
  }
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Controlled Agent Runtime</div>
          <h1>Agent 运行与 Trace</h1>
          <p>在步骤、时间、Token 和审批边界内执行企业工具。</p>
        </div>
        <span className="status">安全模式</span>
      </div>
      <form className="card stack" onSubmit={run}>
        <textarea name="prompt" placeholder="任务" required />
        <select name="toolName">
          <option value="">自动选择</option>
          <option>current_time</option>
          <option>current_user</option>
          <option>knowledge_search</option>
          <option>readonly_query_template</option>
          <option>http_request_whitelist</option>
          <option>create_support_ticket</option>
          <option>get_product</option>
          <option>get_order_status</option>
          <option>send_email</option>
        </select>
        <textarea
          name="toolInput"
          placeholder='Tool JSON，例如 {"title":"问题","description":"详情","idempotencyKey":"ticket-001"}'
        />
        <button>运行</button>
      </form>
      {result !== undefined ? (
        <section>
          <h2>运行结果</h2>
          <pre className="card">{JSON.stringify(result, null, 2)}</pre>
        </section>
      ) : (
        <div className="empty-state">
          <strong>准备运行 Agent</strong>输入任务并选择自动路由或指定一个受控工具。
        </div>
      )}
    </Shell>
  );
}
