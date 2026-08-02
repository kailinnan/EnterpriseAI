import { describe, expect, it } from 'vitest';
import { isPrivateAddress } from './tool.service.js';
import { classifyIntent } from './workflow.service.js';
describe('agent platform security', () => {
  it('blocks private and metadata addresses', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });
  it('routes all workflow paths deterministically', () => {
    expect(classifyIntent('你好')).toBe('ordinary_chat');
    expect(classifyIntent('查询产品资料')).toBe('knowledge_question');
    expect(classifyIntent('创建工单')).toBe('business_query');
    expect(classifyIntent('绕过系统密码')).toBe('sensitive_request');
  });
});
