import { detectPromptInjection } from '../../common/security-policy.js';

export type WorkflowIntent =
  'ordinary_chat' | 'knowledge_question' | 'business_query' | 'sensitive_request';

export const classifyIntent = (text: string): WorkflowIntent => {
  if (detectPromptInjection(text).length || /删除|密码|secret|越权|绕过/i.test(text))
    return 'sensitive_request';
  if (/工单|订单|业务|ticket/i.test(text)) return 'business_query';
  if (/资料|文档|知识|政策|产品|document|knowledge|policy|product/i.test(text))
    return 'knowledge_question';
  return 'ordinary_chat';
};

export const classifyIntentNode = (state: { input: string }) => ({
  intent: classifyIntent(state.input),
});
