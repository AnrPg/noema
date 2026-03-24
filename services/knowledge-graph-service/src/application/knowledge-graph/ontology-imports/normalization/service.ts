import type {
  INormalizedOntologyGraphBatch,
  IParsedOntologyGraphBatch,
  ISourceNormalizer,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

export class OntologyImportNormalizationService {
  private readonly normalizersBySourceId: Map<string, ISourceNormalizer>;

  constructor(normalizers: ISourceNormalizer[]) {
    this.normalizersBySourceId = new Map(
      normalizers.map((normalizer) => [normalizer.sourceId, normalizer])
    );
  }

  async normalizeBatch(batch: IParsedOntologyGraphBatch): Promise<INormalizedOntologyGraphBatch> {
    const normalizer = this.normalizersBySourceId.get(batch.sourceId);
    if (normalizer === undefined) {
      throw new Error(`No ontology normalizer registered for source ${batch.sourceId}.`);
    }

    return normalizer.normalize(batch);
  }
}
