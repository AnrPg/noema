import type {
  IOntologyImportArtifact,
  IOntologyImportRun,
  IParsedOntologyGraphBatch,
  ISourceParser,
} from '../../../../domain/knowledge-graph-service/ontology-imports.contracts.js';

export class OntologyImportParsingService {
  private readonly parsersBySourceId: Map<string, ISourceParser>;

  constructor(parsers: ISourceParser[]) {
    this.parsersBySourceId = new Map(parsers.map((parser) => [parser.sourceId, parser]));
  }

  async parseRun(
    run: IOntologyImportRun,
    artifacts: IOntologyImportArtifact[]
  ): Promise<IParsedOntologyGraphBatch> {
    const parser = this.parsersBySourceId.get(run.sourceId);
    if (parser === undefined) {
      throw new Error(`No ontology source parser registered for ${run.sourceId}.`);
    }

    return parser.parse(run, artifacts);
  }
}
