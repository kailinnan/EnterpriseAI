export const validateInputNode = (state: { input: string }) => {
  if (!state.input.trim() || state.input.length > 10_000) throw new Error('INVALID_INPUT');
  return {};
};
