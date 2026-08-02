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
type KB = {
  id: string;
  name: string;
  description: string;
  embedding_model_config_id: string | null;
  chunk_config_json: { chunkTokens: number; overlapTokens: number; minChunkTokens: number };
};
type Model = { id: string; model_name: string; capability_json: { capabilities?: string[] } };
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<KB>();
  const [models, setModels] = useState<Model[]>([]);
  const load = () =>
    Promise.all([
      api<Doc[]>(`/knowledge-bases/${id}/documents`),
      api<KB>(`/knowledge-bases/${id}`),
      api<Model[]>('/models'),
    ]).then(([documents, kb, configs]) => {
      setDocs(documents);
      setKnowledgeBase(kb);
      setModels(
        configs.filter((model) => model.capability_json.capabilities?.includes('embedding')),
      );
    });
  useEffect(() => {
    void load();
  }, [id]);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await api(`/knowledge-bases/${id}/documents`, { method: 'POST', body: form });
    load();
  }
  async function saveSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await api(`/knowledge-bases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: form.get('name'),
        description: form.get('description'),
        embeddingModelConfigId: form.get('embeddingModelConfigId') || null,
        chunkConfig: {
          chunkTokens: Number(form.get('chunkTokens')),
          overlapTokens: Number(form.get('overlapTokens')),
          minChunkTokens: Number(form.get('minChunkTokens')),
        },
      }),
    });
    void load();
  }
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Document Pipeline</div>
          <h1>知识库详情</h1>
          <p>上传资料并跟踪解析、切片和向量索引状态。</p>
        </div>
        <span className="status neutral">{docs.length} DOCUMENTS</span>
      </div>
      {knowledgeBase && (
        <form
          className="card stack"
          onSubmit={saveSettings}
          key={`${knowledgeBase.id}:${knowledgeBase.name}`}
        >
          <div className="row">
            <input name="name" defaultValue={knowledgeBase.name} required />
            <input name="description" defaultValue={knowledgeBase.description} />
            <select
              name="embeddingModelConfigId"
              defaultValue={knowledgeBase.embedding_model_config_id ?? ''}
            >
              <option value="">默认 Embedding 模型</option>
              {models.map((model) => (
                <option value={model.id} key={model.id}>
                  {model.model_name}
                </option>
              ))}
            </select>
            <button>保存配置</button>
            <button
              type="button"
              className="danger-button"
              onClick={async () => {
                if (!confirm('确定删除整个知识库及其全部文档吗？')) return;
                await api(`/knowledge-bases/${id}`, { method: 'DELETE' });
                location.href = '/knowledge-bases';
              }}
            >
              删除知识库
            </button>
          </div>
          <div className="row">
            <label>
              切片 Token{' '}
              <input
                name="chunkTokens"
                type="number"
                defaultValue={knowledgeBase.chunk_config_json.chunkTokens}
              />
            </label>
            <label>
              重叠 Token{' '}
              <input
                name="overlapTokens"
                type="number"
                defaultValue={knowledgeBase.chunk_config_json.overlapTokens}
              />
            </label>
            <label>
              最小 Token{' '}
              <input
                name="minChunkTokens"
                type="number"
                defaultValue={knowledgeBase.chunk_config_json.minChunkTokens}
              />
            </label>
          </div>
        </form>
      )}
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
            <span className="spacer" />
            <button
              className="secondary"
              onClick={() => api<Chunk[]>(`/documents/${d.id}/chunks`).then(setChunks)}
            >
              预览 Chunk
            </button>
            <button
              className="secondary"
              onClick={() => api(`/documents/${d.id}/reindex`, { method: 'POST' }).then(load)}
            >
              重新处理
            </button>
            <button
              className="danger-button"
              onClick={() => {
                if (confirm(`确定删除 ${d.file_name} 吗？`))
                  void api(`/documents/${d.id}`, { method: 'DELETE' }).then(load);
              }}
            >
              删除
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
