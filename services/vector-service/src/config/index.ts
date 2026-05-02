export interface IVectorServiceConfig {
  server: {
    host: string;
    port: number;
    bodyLimit: number;
  };
  vector: {
    qdrantUrl: string;
    collectionName: string;
    embeddingDimensions: number;
    embeddingModel: string;
  };
}

export function loadConfig(): IVectorServiceConfig {
  return {
    server: {
      host: process.env['HOST'] ?? '0.0.0.0',
      port: parseInt(process.env['PORT_VECTOR_SERVICE'] ?? '3012', 10),
      bodyLimit: parseInt(process.env['VECTOR_SERVICE_BODY_LIMIT'] ?? '10485760', 10),
    },
    vector: {
      qdrantUrl: process.env['QDRANT_URL'] ?? 'http://localhost:6333',
      collectionName: process.env['VECTOR_COLLECTION_NAME'] ?? 'noema_document_chunks',
      embeddingDimensions: parseInt(process.env['VECTOR_EMBEDDING_DIMENSIONS'] ?? '384', 10),
      embeddingModel: process.env['VECTOR_EMBEDDING_MODEL'] ?? 'noema-hash-embedding-v1',
    },
  };
}
