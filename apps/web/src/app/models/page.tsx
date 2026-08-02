'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';
type Provider = { id: string; name: string; provider_type: string; enabled: boolean };
type Model = {
  id: string;
  model_name: string;
  provider_name: string;
  capability_json: { capabilities?: string[] };
};
export default function Page() {
  const [items, setItems] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState('');
  const load = () =>
    Promise.all([api<Provider[]>('/model-providers'), api<Model[]>('/models')])
      .then(([providers, configs]) => {
        setItems(providers);
        setModels(configs);
      })
      .catch((e) => setError(String(e)));
  useEffect(() => {
    void load();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api('/model-providers', {
      method: 'POST',
      body: JSON.stringify({
        name: f.get('name'),
        providerType: f.get('type'),
        baseUrl: f.get('baseUrl') || undefined,
        apiKey: f.get('apiKey') || undefined,
      }),
    });
    load();
  }
  async function createModel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await api('/models', {
      method: 'POST',
      body: JSON.stringify({
        providerId: form.get('providerId'),
        modelName: form.get('modelName'),
        capabilities: form.getAll('capabilities'),
        inputPrice: Number(form.get('inputPrice') ?? 0),
        outputPrice: Number(form.get('outputPrice') ?? 0),
        embeddingDimensions: 1536,
      }),
    });
    e.currentTarget.reset();
    void load();
  }
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Model Gateway</div>
          <h1>模型供应商</h1>
          <p>统一管理 Mock、OpenAI 与 OpenAI-Compatible 模型连接。</p>
        </div>
        <span className="status neutral">{items.length} PROVIDERS</span>
      </div>
      <form className="card row" onSubmit={submit}>
        <input name="name" placeholder="名称" required />
        <select name="type">
          <option value="mock">Mock（测试）</option>
          <option value="openai">OpenAI</option>
          <option value="openai-compatible">OpenAI Compatible</option>
        </select>
        <input name="baseUrl" placeholder="Base URL" />
        <input name="apiKey" type="password" placeholder="API Key（加密保存）" />
        <button>创建</button>
      </form>
      {error && <p className="danger">{error}</p>}
      {items.length === 0 && (
        <div className="empty-state">
          <strong>尚未配置模型供应商</strong>先创建 Mock 供应商即可体验完整流程。
        </div>
      )}
      {items.map((x) => (
        <div className="card row" key={x.id}>
          <strong>{x.name}</strong>
          <span>{x.provider_type}</span>
          <span className="spacer" />
          <button
            className="secondary"
            onClick={() =>
              api(`/model-providers/${x.id}/test`, { method: 'POST' }).then((r) =>
                alert(JSON.stringify(r)),
              )
            }
          >
            测试连接
          </button>
        </div>
      ))}
      <div className="page-heading" style={{ marginTop: 32 }}>
        <div>
          <div className="eyebrow">Model Configurations</div>
          <h2>模型配置</h2>
          <p>配置实际调用的模型名称、能力和每百万 Token 价格。</p>
        </div>
      </div>
      <form className="card row" onSubmit={createModel}>
        <select name="providerId" required defaultValue="">
          <option value="" disabled>
            选择供应商
          </option>
          {items.map((provider) => (
            <option value={provider.id} key={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
        <input
          name="modelName"
          placeholder="例如 gpt-4.1-mini 或 text-embedding-3-small"
          required
        />
        <label className="row">
          <input type="checkbox" name="capabilities" value="chat" />
          Chat
        </label>
        <label className="row">
          <input type="checkbox" name="capabilities" value="embedding" />
          Embedding
        </label>
        <input
          name="inputPrice"
          type="number"
          min="0"
          step="0.000001"
          defaultValue="0"
          aria-label="输入价格"
        />
        <input
          name="outputPrice"
          type="number"
          min="0"
          step="0.000001"
          defaultValue="0"
          aria-label="输出价格"
        />
        <button>添加模型</button>
      </form>
      {models.map((model) => (
        <div className="card row" key={model.id}>
          <strong>{model.model_name}</strong>
          <span>{model.provider_name}</span>
          <span className="tag-list">
            {(model.capability_json.capabilities ?? []).map((capability) => (
              <span key={capability}>{capability}</span>
            ))}
          </span>
        </div>
      ))}
    </Shell>
  );
}
