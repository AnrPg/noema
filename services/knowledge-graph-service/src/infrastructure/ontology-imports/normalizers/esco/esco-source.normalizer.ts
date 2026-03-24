import type {
  INormalizedOntologyGraphBatch,
  IParsedOntologyGraphBatch,
  ISourceNormalizer,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';
import { createNormalizedBatch, slugifyPredicate } from '../helpers.js';

export class EscoSourceNormalizer implements ISourceNormalizer {
  readonly sourceId = 'esco' as const;

  normalize(batch: IParsedOntologyGraphBatch): Promise<INormalizedOntologyGraphBatch> {
    return Promise.resolve(
      createNormalizedBatch(batch, (predicate) => slugifyPredicate(predicate))
    );
  }
}
