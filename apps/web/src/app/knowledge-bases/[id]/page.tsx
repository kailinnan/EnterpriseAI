'use client';
import { FormEvent, useEffect, useState, use } from 'react';
import { Shell } from '../../../components/Shell';
import { api } from '../../../lib/api';
type Doc = {
  id: string;
  file_name: string;
  parse_status: string;
  index_status: string;
  error_message: string | null;
};
type Chunk = { id: string; content: string; page_number: number | null; heading: string | null };
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const load = () => api<Doc[]>(`/knowledge-bases/${id}/documents`).then(setDocs);
  useEffect(() => {
    void load();
  }, [id]);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await api(`/knowledge-bases/${id}/documents`, { method: 'POST', body: form });
    load();
  }
  return (
    <Shell>
      <h1>知识库详情</h1>
      <form className="card row" onSubmit={upload}>
        <input type="file" name="file" accept=".txt,.md,.pdf,.docx,.html" required />
        <button>上传并异步处理</button>
      </form>
      {docs.map((d) => (
        <div className="card" key={d.id}>
          <div className="row">
            <strong>{d.file_name}</strong>
            <span className="status">
              解析 {d.parse_status} / 索引 {d.index_status}
            </span>
            <button onClick={() => api<Chunk[]>(`/documents/${d.id}/chunks`).then(setChunks)}>
              预览 Chunk
            </button>
            <button
              onClick={() => api(`/documents/${d.id}/reindex`, { method: 'POST' }).then(load)}
            >
              重新处理
            </button>
          </div>
          {d.error_message && <p className="danger">{d.error_message}</p>}
        </div>
      ))}
      {chunks.length > 0 && (
        <section>
          <h2>Chunk 预览</h2>
          {chunks.map((c) => (
            <article className="card" key={c.id}>
              <small>
                {c.heading ?? '无标题'} · 页 {c.page_number ?? '-'}
              </small>
              <p>{c.content}</p>
            </article>
          ))}
        </section>
      )}
    </Shell>
  );
}
