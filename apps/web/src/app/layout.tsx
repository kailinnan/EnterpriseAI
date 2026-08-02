import './globals.css';
import type { ReactNode } from 'react';
export const metadata = { title: 'Enterprise AI Hub', description: '企业知识库与 RAG 助手' };
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
