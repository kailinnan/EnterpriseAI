'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Shell } from '../../components/Shell';
import { base, token, api } from '../../lib/api';
type Citation = {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  heading: string | null;
  excerpt: string;
};
type Message = { role: 'user' | 'assistant'; text: string; citations?: Citation[] };
export default function Page() {
  const [conversation, setConversation] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [trace, setTrace] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('conversation');
    if (fromUrl && !conversation) {
      setConversation(fromUrl);
      return;
    }
    if (conversation)
      api<{ role: string; content_json: { text?: string; citations?: Citation[] } }[]>(
        `/conversations/${conversation}/messages`,
      ).then((rows) =>
        setMessages(
          rows.map((x) => ({
            role: x.role as 'user' | 'assistant',
            text: x.content_json.text ?? '',
            ...(x.content_json.citations ? { citations: x.content_json.citations } : {}),
          })),
        ),
      );
  }, [conversation]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const content = String(f.get('content'));
    setMessages((x) => [
      ...x,
      { role: 'user', text: content },
      { role: 'assistant', text: '', citations: [] },
    ]);
    setBusy(true);
    const response = await fetch(`${base}/conversations/${conversation}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ content }),
    });
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const event = block.match(/^event: (.+)$/m)?.[1];
        const raw = block.match(/^data: (.+)$/m)?.[1];
        if (!event || !raw) continue;
        const data = JSON.parse(raw) as Record<string, unknown>;
        if (event === 'response.started') setTrace(String(data.traceId));
        if (event === 'response.delta')
          setMessages((x) =>
            x.map((m, i) => (i === x.length - 1 ? { ...m, text: m.text + String(data.delta) } : m)),
          );
        if (event === 'citation')
          setMessages((x) =>
            x.map((m, i) =>
              i === x.length - 1
                ? { ...m, citations: [...(m.citations ?? []), data as unknown as Citation] }
                : m,
            ),
          );
        box.current?.scrollTo({ top: box.current.scrollHeight });
      }
    }
    setBusy(false);
  }
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Grounded Conversation</div>
          <h1>知识库对话</h1>
          <p>基于已授权资料生成回答，并由服务端验证每一条引用。</p>
        </div>
        <span className={busy ? 'status warning' : 'status'}>{busy ? '生成中' : '准备就绪'}</span>
      </div>
      <div className="card row">
        <input
          value={conversation}
          onChange={(e) => setConversation(e.target.value)}
          placeholder="Conversation UUID"
        />
        <button
          onClick={() =>
            conversation &&
            api(`/conversations/${conversation}/summarize`, { method: 'POST' }).then((r) =>
              alert(JSON.stringify(r)),
            )
          }
        >
          压缩历史
        </button>
        {busy && (
          <button onClick={() => api(`/generations/${trace}/stop`, { method: 'POST' })}>
            停止生成
          </button>
        )}
      </div>
      <div className="chat" ref={box}>
        {messages.map((m, i) => (
          <div className={`message ${m.role}`} key={i}>
            {m.text}
            {m.citations?.map((c) => (
              <details className="citation" key={c.chunkId}>
                <summary>
                  {c.documentName} · {c.heading ?? '段落'} · 页 {c.pageNumber ?? '-'}
                </summary>
                {c.excerpt}
              </details>
            ))}
          </div>
        ))}
      </div>
      <form className="card row chat-composer" onSubmit={submit}>
        <input
          name="content"
          style={{ flex: 1 }}
          placeholder="输入问题"
          disabled={!conversation || busy}
          required
        />
        <button disabled={!conversation || busy}>发送</button>
      </form>
    </Shell>
  );
}
