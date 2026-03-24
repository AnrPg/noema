import type {
  INormalizedOntologyGraphBatch,
  IParsedOntologyGraphBatch,
  ISourceNormalizer,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';
import { createNormalizedBatch, slugifyPredicate } from '../helpers.js';

const PREDICATE_MAP: Record<string, string> = {
  isa: 'is_a',
  partof: 'part_of',
  hasa: 'has_a',
  usedfor: 'used_for',
  capableof: 'capable_of',
  atlocation: 'at_location',
  relatedto: 'related_to',
};

export class ConceptNetSourceNormalizer implements ISourceNormalizer {
  readonly sourceId = 'conceptnet' as const;

  normalize(batch: IParsedOntologyGraphBatch): Promise<INormalizedOntologyGraphBatch> {
    return Promise.resolve(
      createNormalizedBatch(batch, (predicate) => {
        const normalized = slugifyPredicate(predicate);
        const compact = normalized.replaceAll('_', '');
        return PREDICATE_MAP[compact] ?? normalized;
      })
    );
  }
}
