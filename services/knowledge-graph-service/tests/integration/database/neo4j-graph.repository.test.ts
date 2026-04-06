import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pino from 'pino';

import { Neo4jClient } from '../../../src/infrastructure/database/neo4j-client.js';
import { Neo4jGraphRepository } from '../../../src/infrastructure/database/neo4j-graph.repository.js';
import { canUseDockerRuntime, startNeo4jContainer } from '../../helpers/docker-integration.js';

const neo4jUri = process.env['NEO4J_URI'];
const neo4jUser = process.env['NEO4J_USER'];
const neo4jPassword = process.env['NEO4J_PASSWORD'];
const neo4jDatabase = process.env['NEO4J_DATABASE'];
const hasNeo4jIntegration =
  [neo4jUri, neo4jUser, neo4jPassword, neo4jDatabase].every(
    (value) => value !== undefined && value !== ''
  ) || canUseDockerRuntime();

describe.runIf(hasNeo4jIntegration)('Neo4j — Node Operations', () => {
  const logger = pino({ level: 'silent' });
  const nodeIds: string[] = [];
  let client: Neo4jClient;
  let repository: Neo4jGraphRepository;
  let runtimeDispose: (() => Promise<void>) | null = null;
  let runtimeConfig = {
    uri: neo4jUri,
    user: neo4jUser,
    password: neo4jPassword,
    database: neo4jDatabase,
  };

  beforeAll(async () => {
    if (
      runtimeConfig.uri === undefined ||
      runtimeConfig.user === undefined ||
      runtimeConfig.password === undefined ||
      runtimeConfig.database === undefined
    ) {
      const runtime = await startNeo4jContainer();
      runtimeConfig = {
        uri: runtime.uri,
        user: runtime.user,
        password: runtime.password,
        database: runtime.database,
      };
      runtimeDispose = runtime.dispose;
    }

    client = new Neo4jClient(
      {
        uri: runtimeConfig.uri!,
        user: runtimeConfig.user!,
        password: runtimeConfig.password!,
        database: runtimeConfig.database!,
        maxConnectionPoolSize: 10,
        acquisitionTimeoutMs: 30_000,
      },
      logger
    );
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        await client.verifyConnectivity();
        break;
      } catch (error) {
        if (attempt === 29) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
    repository = new Neo4jGraphRepository(client, logger);
  }, 120_000);

  afterAll(async () => {
    if (nodeIds.length > 0) {
      const session = client.getSession();
      try {
        await session.run('MATCH (n) WHERE n.id IN $ids DETACH DELETE n', { ids: nodeIds });
      } finally {
        await session.close();
      }
    }
    await client.close();
    await runtimeDispose?.();
  });

  it('creates and retrieves a real PKG node', async () => {
    const node = await repository.createNode(
      'pkg',
      {
        label: `Integration Node ${Date.now().toString(36)}`,
        nodeType: 'concept',
        domain: 'integration',
      },
      'user_integration' as never
    );
    nodeIds.push(node.nodeId);

    const loaded = await repository.getNode(node.nodeId, 'user_integration' as never);
    expect(loaded?.nodeId).toBe(node.nodeId);
    expect(loaded?.label).toBe(node.label);
  });
});
