/**
 * @noema/knowledge-graph-service — Neo4j Client
 *
 * Thin wrapper around the Neo4j JavaScript driver that centralizes
 * connection management, session creation, and health checks.
 */

import neo4j, { type Driver, type Session, type SessionConfig } from 'neo4j-driver';
import type pino from 'pino';

// ============================================================================
// Configuration
// ============================================================================

export interface INeo4jConfig {
  uri: string;
  user: string;
  password: string;
  database: string;
  maxConnectionPoolSize: number;
  acquisitionTimeoutMs: number;
}

// ============================================================================
// Neo4j Client
// ============================================================================

export class Neo4jClient {
  private readonly driver: Driver;
  private readonly database: string;
  private readonly logger: pino.Logger;

  constructor(config: INeo4jConfig, logger: pino.Logger) {
    this.database = config.database;
    this.logger = logger.child({ component: 'neo4j' });

    this.driver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password), {
      maxConnectionPoolSize: config.maxConnectionPoolSize,
      connectionAcquisitionTimeout: config.acquisitionTimeoutMs,
      logging: {
        level: 'warn',
        logger: (level: string, message: string) => {
          this.logger[level === 'error' ? 'error' : 'warn']({ neo4jLevel: level }, message);
        },
      },
    });
  }

  /**
   * Create a new session targeting the configured database.
   * Caller is responsible for closing the session.
   */
  getSession(config?: Omit<SessionConfig, 'database'>): Session {
    return this.driver.session({
      database: this.database,
      ...config,
    });
  }

  /**
   * Verify that the driver can connect to the Neo4j instance.
   * Uses getServerInfo() which is the non-deprecated alternative to verifyConnectivity().
   * Used for health checks and initial connectivity verification.
   */
  async verifyConnectivity(): Promise<void> {
    await this.driver.getServerInfo({ database: this.database });
  }

  /**
   * Gracefully close the driver and all connections.
   */
  async close(): Promise<void> {
    await this.driver.close();
  }
}
