import type { IKnowledgeGraphService } from '../../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { IExecutionContext } from '../../../domain/knowledge-graph-service/execution-context.js';
import type { CorrelationId, NodeId, UserId } from '@noema/types';
import type {
  IPkgBulkDeleteInput,
  IPkgBulkDeleteResult,
  IPkgMaintenanceApplicationService,
  IPkgMaintenancePort,
  IPkgResetInput,
  IPkgResetResult,
} from './contracts.js';

function buildExecutionContext(input: IPkgBulkDeleteInput): IExecutionContext {
  return {
    userId: (input.actorId ?? null) as UserId | null,
    correlationId: (input.correlationId ?? `pkg-bulk-delete:${input.userId}:${Date.now()}`) as CorrelationId,
    roles: [],
  };
}

export class PkgMaintenanceApplicationService implements IPkgMaintenanceApplicationService {
  constructor(
    private readonly knowledgeGraphService: IKnowledgeGraphService,
    private readonly maintenancePort: IPkgMaintenancePort
  ) {}

  async bulkDeleteNodes(input: IPkgBulkDeleteInput): Promise<IPkgBulkDeleteResult> {
    const uniqueNodeIds = [...new Set(input.nodeIds.filter((nodeId) => nodeId.trim() !== ''))];
    const context = buildExecutionContext(input);
    const deletedNodeIds: string[] = [];
    const failures: IPkgBulkDeleteResult['failed'] = [];
    let deletedEdgeCount = 0;

    for (const nodeId of uniqueNodeIds) {
      try {
        const edgeResult = await this.knowledgeGraphService.listEdges(
          input.userId as UserId,
          { userId: input.userId, nodeId: nodeId as NodeId },
          { limit: 5000, offset: 0 },
          context
        );
        deletedEdgeCount += edgeResult.data.total ?? edgeResult.data.items.length;

        await this.knowledgeGraphService.deleteNode(
          input.userId as UserId,
          nodeId as NodeId,
          context
        );
        deletedNodeIds.push(nodeId);
      } catch (error) {
        failures.push({
          nodeId,
          reason: error instanceof Error ? error.message : 'Unknown deletion error',
        });
      }
    }

    return {
      userId: input.userId,
      deletedNodeIds,
      deletedEdgeCount,
      failed: failures,
      deletedAt: new Date().toISOString(),
    };
  }

  async resetPkg(input: IPkgResetInput): Promise<IPkgResetResult> {
    return this.maintenancePort.reset(input);
  }
}
