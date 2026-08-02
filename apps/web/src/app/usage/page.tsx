'use client';
import { useEffect, useState } from 'react';
import { Shell } from '../../components/Shell';
import { api } from '../../lib/api';
export default function Page() {
  const [summary, setSummary] = useState<unknown>();
  const [series, setSeries] = useState<unknown>();
  useEffect(() => {
    void Promise.all([
      api('/usage/summary').then(setSummary),
      api('/usage/timeseries').then(setSeries),
    ]);
  }, []);
  return (
    <Shell>
      <h1>用量与成本</h1>
      <div className="grid">
        <pre className="card">{JSON.stringify(summary, null, 2)}</pre>
        <pre className="card">{JSON.stringify(series, null, 2)}</pre>
      </div>
    </Shell>
  );
}
