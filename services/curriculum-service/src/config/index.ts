/* eslint-disable @typescript-eslint/naming-convention */
export interface CurriculumServiceConfig {
  service: {
    name: string;
    version: string;
    environment: string;
  };
  server: {
    host: string;
    port: number;
    bodyLimit: number;
  };
  redis: {
    url: string;
  };
  external: {
    curriculumAgentUrl: string;
    schedulerServiceUrl: string;
    knowledgeGraphServiceUrl: string;
    pedagogyGuardianServiceUrl: string;
    serviceToken: string | undefined;
  };
}

export function loadConfig(): CurriculumServiceConfig {
  return {
    service: {
      name: process.env['SERVICE_NAME'] ?? 'curriculum-service',
      version: process.env['SERVICE_VERSION'] ?? '0.1.0',
      environment: process.env['NODE_ENV'] ?? 'development',
    },
    server: {
      host: process.env['HOST'] ?? '0.0.0.0',
      port: Number(process.env['PORT'] ?? 3017),
      bodyLimit: Number(process.env['BODY_LIMIT'] ?? 1_048_576),
    },
    redis: {
      url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    },
    external: {
      curriculumAgentUrl: process.env['CURRICULUM_AGENT_URL'] ?? 'http://localhost:8030',
      schedulerServiceUrl: process.env['SCHEDULER_SERVICE_URL'] ?? 'http://localhost:3003',
      knowledgeGraphServiceUrl:
        process.env['KNOWLEDGE_GRAPH_SERVICE_URL'] ?? 'http://localhost:3004',
      pedagogyGuardianServiceUrl:
        process.env['PEDAGOGY_GUARDIAN_SERVICE_URL'] ?? 'http://localhost:3016',
      serviceToken: process.env['SERVICE_AUTH_TOKEN'],
    },
  };
}
