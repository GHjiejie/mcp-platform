export type VectorChunk = {
  id: string;
  filePath: string;
  fileName: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  mtimeMs: number;
};

export type PersistedFileEntry = {
  filePath: string;
  mtimeMs: number;
  size: number;
  chunks: VectorChunk[];
};

export type PersistedVectorStore = {
  knowledgeBasePath: string;
  builtAt: string;
  files: PersistedFileEntry[];
};
