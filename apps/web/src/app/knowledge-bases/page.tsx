'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';
type KB = { id: string; name: string; description: string; status: string };
type Model = { id: string; model_name: string; capability_json: { capabilities?: string[] } };
export default function Page() {
  const [items, setItems] = useState<KB[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const load = () =>
    Promise.all([api<KB[]>('/knowledge-bases'), api<Model[]>('/models')]).then(
      ([knowledgeBases, modelConfigs]) => {
        setItems(knowledgeBases);
        setModels(
          modelConfigs.filter((model) => model.capability_json.capabilities?.includes('embedding')),
        );
      },
    );
  useEffect(() => {
    void load();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api('/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify({
        name: f.get('name'),
        description: f.get('description'),
        embeddingModelConfigId: f.get('embeddingModelConfigId') || undefined,
        chunkConfig: {
          chunkTokens: Number(f.get('chunkTokens')),
          overlapTokens: Number(f.get('overlapTokens')),
          minChunkTokens: Number(f.get('minChunkTokens')),
        },
      }),
    });
    load();
  }
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Knowledge Management</div>
          <h1>企业知识库</h1>
          <p>集中管理企业文档、切片配置与向量索引。</p>
        </div>
        <span className="status neutral">{items.length} KNOWLEDGE BASES</span>
      </div>
      <form className="card stack" onSubmit={submit}>
        <div className="row">
          <input name="name" placeholder="知识库名称" required />
          <input name="description" placeholder="说明" />
          <select name="embeddingModelConfigId" defaultValue="">
            <option value="">默认 Embedding 模型</option>
            {models.map((model) => (
              <option value={model.id} key={model.id}>
                {model.model_name}
              </option>
            ))}
          </select>
          <button>创建</button>
        </div>
        <div className="row">
          <label>
            切片 Token{' '}
            <input name="chunkTokens" type="number" defaultValue="800" min="100" max="4000" />
          </label>
          <label>
            重叠 Token{' '}
            <input name="overlapTokens" type="number" defaultValue="120" min="0" max="799" />
          </label>
          <label>
            最小 Token{' '}
            <input name="minChunkTokens" type="number" defaultValue="80" min="1" max="800" />
          </label>
        </div>
      </form>
      <div className="grid">
        {items.map((x) => (
          <Link className="card" href={`/knowledge-bases/${x.id}`} key={x.id}>
            <h3>{x.name}</h3>
            <p>{x.description}</p>
            <span className="status">{x.status}</span>
          </Link>
        ))}
      </div>
      {items.length === 0 && (
        <div className="empty-state">
          <strong>还没有知识库</strong>创建第一个知识库，然后上传企业资料开始构建索引。
        </div>
      )}
    </Shell>
  );
}
