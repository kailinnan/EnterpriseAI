export const retrieveKnowledgeNode = async (
  state: { knowledgeBaseIds: string[]; input: string },
  search: (input: {
    knowledgeBaseIds: string[];
    query: string;
    topK: number;
  }) => Promise<unknown[]>,
) => ({
  retrievedChunks: (await search({
    knowledgeBaseIds: state.knowledgeBaseIds,
    query: state.input,
    topK: 8,
  })) as Record<string, unknown>[],
});
