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
      await api('/workflow-runs', {
        method: 'POST',
        body: JSON.stringify({
          text: f.get('text'),
          knowledgeBaseIds: String(f.get('kbIds') ?? '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      }),
    );
  }
  return (
    <Shell>
      <h1>Workflow Trace</h1>
      <form className="card stack" onSubmit={run}>
        <textarea name="text" placeholder="输入普通对话、知识问题、业务查询或敏感请求" required />
        <input name="kbIds" placeholder="知识库 UUID，多个逗号分隔" />
        <button>执行工作流</button>
      </form>
      {result !== undefined && <pre className="card">{JSON.stringify(result, null, 2)}</pre>}
    </Shell>
  );
}
