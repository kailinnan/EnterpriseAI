'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Shell } from '../components/Shell';

const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(
  '/api/v1',
  '',
);

const services = [
  ['api', 'API Gateway', 'API', '认证、检索与模型服务'],
  ['postgres', 'PostgreSQL', 'PG', '业务数据与 pgvector'],
  ['redis', 'Redis Queue', 'RQ', '缓存与异步任务队列'],
  ['minio', 'MinIO Storage', 'S3', '企业文档对象存储'],
] as const;

const quickLinks = [
  ['/knowledge-bases', '构建企业知识库', '上传并索引 PDF、DOCX、Markdown 等企业资料。', '01'],
  ['/assistants', '配置智能助手', '绑定模型和知识库，创建面向业务的问答助手。', '02'],
  ['/agent-runs', '运行安全 Agent', '调用受控工具，并对副作用操作进行人工审批。', '03'],
  ['/workflows', '编排业务工作流', '查看 LangGraph 路径、节点状态与执行轨迹。', '04'],
] as const;

export default function Home() {
  const [health, setHealth] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiOrigin}/health/ready`)
      .then((response) => response.json())
      .then((result: { checks: Record<string, boolean> }) =>
        setHealth({ api: true, ...result.checks }),
      )
      .catch(() => setHealth({ api: false }))
      .finally(() => setLoading(false));
  }, []);

  const healthyCount = services.filter(([key]) => health[key]).length;

  return (
    <Shell>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow" style={{ color: '#9cdece' }}>
            Enterprise Intelligence Workspace
          </div>
          <h1>让企业知识真正参与每一次智能决策。</h1>
          <p>
            统一管理知识、模型、助手和 Agent 工作流，在清晰的权限与审计边界内构建可信赖的 AI 应用。
          </p>
          <div className="hero-actions">
            <Link href="/knowledge-bases">进入知识库</Link>
            <Link className="secondary" href="/assistants">
              创建智能助手
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <small>平台运行状态</small>
          <strong>{loading ? '正在检查…' : `${healthyCount} / ${services.length} 正常`}</strong>
          <span className={healthyCount === services.length ? 'status' : 'status warning'}>
            {loading
              ? '连接中'
              : healthyCount === services.length
                ? '所有核心服务可用'
                : '部分服务需要关注'}
          </span>
          <div className="row">
            <small>RAG</small>
            <small>Agent</small>
            <small>Workflow</small>
            <small>Audit</small>
          </div>
        </div>
      </section>

      <div className="page-heading">
        <div>
          <div className="eyebrow">System Health</div>
          <h1>核心服务</h1>
          <p>实时检查本地开发环境的关键基础设施连接状态。</p>
        </div>
        <Link className="docs-link" href="http://localhost:3001/health/ready" target="_blank">
          查看健康接口 ↗
        </Link>
      </div>

      <div className="grid">
        {services.map(([key, name, mark, description]) => (
          <div className="card health-card" key={key}>
            <span className="health-icon">{mark}</span>
            <span>
              <strong>{name}</strong>
              <small>{description}</small>
            </span>
            <span className="spacer" />
            <span className={health[key] ? 'status' : 'status warning'}>
              {loading ? '检查中' : health[key] ? '正常' : '不可用'}
            </span>
          </div>
        ))}
      </div>

      <div className="page-heading" style={{ marginTop: 34 }}>
        <div>
          <div className="eyebrow">Quick Start</div>
          <h1>开始构建</h1>
          <p>从企业资料到可控 Agent，按业务场景快速进入对应工作区。</p>
        </div>
      </div>
      <div className="grid-2">
        {quickLinks.map(([href, title, description, index]) => (
          <Link className="card quick-link" href={href} key={href}>
            <div className="eyebrow">STEP {index}</div>
            <h3>{title}</h3>
            <p>{description}</p>
            <span className="arrow">→</span>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
