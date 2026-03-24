import type {
  INormalizedOntologyGraphBatch,
  IParsedOntologyGraphBatch,
  ISourceNormalizer,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';
import { createNormalizedBatch, slugifyPredicate } from '../helpers.js';

export class YagoSourceNormalizer implements ISourceNormalizer {
  readonly sourceId = 'yago' as const;

  normalize(batch: IParsedOntologyGraphBatch): Promise<INormalizedOntologyGraphBatch> {
    return Promise.resolve(
      createNormalizedBatch(batch, (predicate) => {
        const normalized = slugifyPredicate(predicate);
        if (normalized === 'type') {
          return 'instance_of';
        }
        if (normalized === 'sub_class_of' || normalized === 'subclassof') {
          return 'subclass_of';
        }
        return normalized;
      })
    );
  }
}
