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
      <h1>Agent 运行与 Trace</h1>
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
        </select>
        <textarea
          name="toolInput"
          placeholder='Tool JSON，例如 {"title":"问题","description":"详情","idempotencyKey":"ticket-001"}'
        />
        <button>运行</button>
      </form>
      {result !== undefined && <pre className="card">{JSON.stringify(result, null, 2)}</pre>}
    </Shell>
  );
}
