export const citationValidateNode = (state: { retrievedChunks: Record<string, unknown>[] }) => ({
  citations: state.retrievedChunks.map((chunk) => String(chunk.chunkId ?? '')).filter(Boolean),
});
