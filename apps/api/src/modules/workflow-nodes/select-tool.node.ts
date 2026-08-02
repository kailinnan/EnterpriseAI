export const selectToolNode = (state: { input: string }) => ({
  selectedTools: [/工单|ticket/i.test(state.input) ? 'create_support_ticket' : 'current_user'],
});
