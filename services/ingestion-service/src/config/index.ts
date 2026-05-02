export interface IIngestionServiceConfig {
  server: {
    host: string;
    port: number;
    bodyLimit: number;
  };
  redis: {
    url: string;
  };
  external: {
    vectorServiceUrl: string;
    contentServiceUrl: string;
    curriculumServiceUrl: string;
    knowledgeGraphServiceUrl: string;
    serviceToken: string | undefined;
  };
}

export function loadConfig(): IIngestionServiceConfig {
  return {
    server: {
      host: process.env['HOST'] ?? '0.0.0.0',
      port: Number(process.env['PORT_INGESTION_SERVICE'] ?? process.env['PORT'] ?? 3009),
      bodyLimit: Number(process.env['INGESTION_BODY_LIMIT'] ?? 20_971_520),
    },
    redis: {
      url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    },
    external: {
      vectorServiceUrl: process.env['VECTOR_SERVICE_URL'] ?? 'http://localhost:3012',
      contentServiceUrl: process.env['CONTENT_SERVICE_URL'] ?? 'http://localhost:3005',
      curriculumServiceUrl: process.env['CURRICULUM_SERVICE_URL'] ?? 'http://localhost:3017',
      knowledgeGraphServiceUrl:
        process.env['KNOWLEDGE_GRAPH_SERVICE_URL'] ?? 'http://localhost:3004',
      serviceToken: process.env['SERVICE_AUTH_TOKEN'],
    },
  };
}
