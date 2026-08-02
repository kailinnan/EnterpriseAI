'use client';
import { FormEvent, useState } from 'react';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';
type Result = {
  chunkId: string;
  documentName: string;
  content: string;
  vectorScore: number;
  keywordScore: number;
  finalScore: number;
};
export default function Page() {
  const [results, setResults] = useState<Result[]>([]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setResults(
      await api('/retrieval/debug', {
        method: 'POST',
        body: JSON.stringify({
          knowledgeBaseIds: String(f.get('ids'))
            .split(',')
            .map((x) => x.trim()),
          query: f.get('query'),
        }),
      }),
    );
  }
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Retrieval Lab</div>
          <h1>Hybrid Retrieval Debugger</h1>
          <p>对比语义向量、全文关键词和 RRF 融合排序结果。</p>
        </div>
        <span className="status neutral">PGVECTOR + FTS</span>
      </div>
      <form className="card stack" onSubmit={submit}>
        <input name="ids" placeholder="知识库 UUID，多个用逗号分隔" required />
        <input name="query" placeholder="测试问题" required />
        <button>检索</button>
      </form>
      {results.map((x) => (
        <div className="card" key={x.chunkId}>
          <div className="row">
            <strong>{x.documentName}</strong>
            <code>vector {x.vectorScore.toFixed(4)}</code>
            <code>keyword {x.keywordScore.toFixed(4)}</code>
            <code>RRF {x.finalScore.toFixed(4)}</code>
          </div>
          <p>{x.content}</p>
        </div>
      ))}
      {results.length === 0 && (
        <div className="empty-state">
          <strong>等待检索查询</strong>指定知识库并输入问题后，这里将展示召回分数和 Chunk 内容。
        </div>
      )}
    </Shell>
  );
}
