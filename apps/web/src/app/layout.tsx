import './globals.css';
import type { ReactNode } from 'react';
export const metadata = {
  title: { default: 'Enterprise AI Hub', template: '%s · Enterprise AI Hub' },
  description: '多租户企业知识库、RAG 助手与安全 Agent 管理平台',
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
