import type { ConceptId, ConceptState, StudyMode, UserId } from '@noema/types';
import type pino from 'pino';
import type { ManagedTransaction } from 'neo4j-driver';
import type { IConceptStateGraphPort } from '../../domain/knowledge-graph-service/concept-state.service.js';
import type { Neo4jClient } from './neo4j-client.js';

function conceptStatePropertyValue(state: ConceptState): string {
  return state;
}

export class Neo4jConceptStateRepository implements IConceptStateGraphPort {
  private readonly logger: pino.Logger;

  constructor(
    private readonly neo4j: Neo4jClient,
    logger: pino.Logger
  ) {
    this.logger = logger.child({ component: 'Neo4jConceptStateRepository' });
  }

  async setConceptState(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
    readonly studyMode: StudyMode;
    readonly state: ConceptState;
  }): Promise<void> {
    const session = this.neo4j.getSession();
    try {
      await session.executeWrite((tx: ManagedTransaction) =>
        tx.run(
          `MATCH (n:PkgNode {nodeId: $conceptId, userId: $userId})
           WHERE coalesce(n.isDeleted, false) = false
           MERGE (projection:ConceptStudyState {
             userId: $userId,
             conceptId: $conceptId,
             studyMode: $studyMode
           })
           SET projection.state = $state,
               projection.updatedAt = $updatedAt
           MERGE (n)-[rel:HAS_STUDY_STATE {studyMode: $studyMode}]->(projection)
           SET rel.updatedAt = $updatedAt,
               n.updatedAt = $updatedAt`,
          {
            userId: input.userId,
            conceptId: input.conceptId,
            studyMode: input.studyMode,
            state: conceptStatePropertyValue(input.state),
            updatedAt: new Date().toISOString(),
          }
        )
      );
    } catch (error) {
      this.logger.warn({ error, ...input }, 'Failed to update Neo4j concept state property');
    } finally {
      await session.close();
    }
  }

  async getPrerequisiteConceptIds(input: {
    readonly userId: UserId;
    readonly conceptId: ConceptId;
  }): Promise<ConceptId[]> {
    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead((tx: ManagedTransaction) =>
        tx.run(
          `MATCH (target:PkgNode {nodeId: $conceptId, userId: $userId})-[:PREREQUISITE]->(prereq:PkgNode {userId: $userId})
           WHERE coalesce(target.isDeleted, false) = false
             AND coalesce(prereq.isDeleted, false) = false
           RETURN prereq.nodeId AS conceptId
           ORDER BY prereq.label ASC`,
          { userId: input.userId, conceptId: input.conceptId }
        )
      );
      return result.records
        .map((record) => record.get('conceptId'))
        .filter((conceptId): conceptId is ConceptId => typeof conceptId === 'string');
    } finally {
      await session.close();
    }
  }

  async getConceptDomains(input: {
    readonly userId: UserId;
    readonly conceptIds: readonly ConceptId[];
  }): Promise<Map<ConceptId, string>> {
    if (input.conceptIds.length === 0) return new Map();
    const session = this.neo4j.getSession();
    try {
      const result = await session.executeRead((tx: ManagedTransaction) =>
        tx.run(
          `UNWIND $conceptIds AS conceptId
           MATCH (n:PkgNode {nodeId: conceptId, userId: $userId})
           WHERE coalesce(n.isDeleted, false) = false
           RETURN n.nodeId AS conceptId, coalesce(n.domain, 'general') AS domain`,
          { userId: input.userId, conceptIds: input.conceptIds }
        )
      );
      return new Map(
        result.records
          .map((record) => [record.get('conceptId'), record.get('domain')] as const)
          .filter(
            (entry): entry is readonly [ConceptId, string] =>
              typeof entry[0] === 'string' && typeof entry[1] === 'string'
          )
      );
    } finally {
      await session.close();
    }
  }
}
