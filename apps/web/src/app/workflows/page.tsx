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
      <div className="page-heading">
        <div>
          <div className="eyebrow">LangGraph Orchestration</div>
          <h1>Workflow Trace</h1>
          <p>测试意图分类、知识检索、工具执行与安全审查路径。</p>
        </div>
        <span className="status neutral">4 ROUTES</span>
      </div>
      <form className="card stack" onSubmit={run}>
        <textarea name="text" placeholder="输入普通对话、知识问题、业务查询或敏感请求" required />
        <input name="kbIds" placeholder="知识库 UUID，多个逗号分隔" />
        <button>执行工作流</button>
      </form>
      {result !== undefined ? (
        <section>
          <h2>工作流状态</h2>
          <pre className="card">{JSON.stringify(result, null, 2)}</pre>
        </section>
      ) : (
        <div className="empty-state">
          <strong>等待工作流输入</strong>提交普通对话、知识问题、业务查询或敏感请求以查看执行路径。
        </div>
      )}
    </Shell>
  );
}
