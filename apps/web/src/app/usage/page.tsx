'use client';

import { useEffect, useMemo, useState } from 'react';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';

type Summary = {
  limits: {
    monthlyTokens?: number;
    dailyRequests?: number;
    concurrentRuns?: number;
    storageBytes?: number;
  };
  usage?: { tokens?: string; cost?: string };
  buckets?: { bucket_type: string; used: string; bonus: string; period_start: string }[];
};
type Point = {
  bucket: string;
  input_tokens: string;
  output_tokens: string;
  embedding_tokens: string;
  cost: string;
};

const compact = (value: number) =>
  new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export default function Page() {
  const [summary, setSummary] = useState<Summary>();
  const [series, setSeries] = useState<Point[]>([]);
  useEffect(() => {
    void Promise.all([
      api<Summary>('/usage/summary').then(setSummary),
      api<Point[]>('/usage/timeseries').then(setSeries),
    ]);
  }, []);

  const tokens = Number(summary?.usage?.tokens ?? 0);
  const monthly = Number(summary?.limits?.monthlyTokens ?? 0);
  const maxDaily = useMemo(
    () =>
      Math.max(
        1,
        ...series.map(
          (point) =>
            Number(point.input_tokens) +
            Number(point.output_tokens) +
            Number(point.embedding_tokens),
        ),
      ),
    [series],
  );
  const usedPercent = monthly ? Math.min(100, (tokens / monthly) * 100) : 0;

  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Consumption Analytics</div>
          <h1>用量与成本</h1>
          <p>跟踪模型 Token、预算额度和近 30 天调用趋势。</p>
        </div>
        <span className="status">本月额度正常</span>
      </div>

      <div className="grid">
        <div className="card metric-card">
          <span className="metric-icon">T</span>
          <span className="metric-label">本月 Token</span>
          <strong className="metric-value">{compact(tokens)}</strong>
          <span className="metric-note">占额度 {usedPercent.toFixed(1)}%</span>
        </div>
        <div className="card metric-card">
          <span className="metric-icon">¥</span>
          <span className="metric-label">预估模型成本</span>
          <strong className="metric-value">¥{Number(summary?.usage?.cost ?? 0).toFixed(4)}</strong>
          <span className="metric-note">按模型配置单价估算</span>
        </div>
        <div className="card metric-card">
          <span className="metric-icon">R</span>
          <span className="metric-label">每日请求上限</span>
          <strong className="metric-value">
            {compact(Number(summary?.limits?.dailyRequests ?? 0))}
          </strong>
          <span className="metric-note">租户与 API Key 共享策略</span>
        </div>
        <div className="card metric-card">
          <span className="metric-icon">C</span>
          <span className="metric-label">并发运行上限</span>
          <strong className="metric-value">{summary?.limits?.concurrentRuns ?? '—'}</strong>
          <span className="metric-note">Agent 与 Workflow</span>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="card-header">
            <div>
              <h2>近 30 天趋势</h2>
              <p>每日输入、输出与 Embedding Token 总量</p>
            </div>
            <span className="status neutral">30 DAYS</span>
          </div>
          {series.length ? (
            <div className="usage-chart">
              {series.slice(-14).map((point) => {
                const value =
                  Number(point.input_tokens) +
                  Number(point.output_tokens) +
                  Number(point.embedding_tokens);
                return (
                  <div
                    className="usage-bar-wrap"
                    key={point.bucket}
                    title={`${new Date(point.bucket).toLocaleDateString()} · ${value} tokens`}
                  >
                    <div
                      className="usage-bar"
                      style={{ height: `${Math.max(5, (value / maxDaily) * 100)}%` }}
                    />
                    <small>{new Date(point.bucket).getDate()}</small>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <strong>暂无用量趋势</strong>完成一次模型调用后，这里会显示每日趋势。
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-header">
            <div>
              <h2>套餐额度</h2>
              <p>当前开发套餐资源上限</p>
            </div>
          </div>
          <div className="quota-list">
            <div>
              <span>月度 Token</span>
              <strong>{compact(monthly)}</strong>
            </div>
            <div>
              <span>存储空间</span>
              <strong>
                {(Number(summary?.limits?.storageBytes ?? 0) / 1024 ** 3).toFixed(1)} GB
              </strong>
            </div>
            <div>
              <span>本月已使用</span>
              <strong>{compact(tokens)}</strong>
            </div>
          </div>
          <div className="progress-track">
            <i style={{ width: `${usedPercent}%` }} />
          </div>
          <small className="muted">剩余约 {compact(Math.max(0, monthly - tokens))} Token</small>
        </section>
      </div>
    </Shell>
  );
}
