import type { IDocumentDto } from '@noema/contracts';
import type {
  IDocumentParserPort,
  IParsedDocument,
} from '../../domain/ingestion-service/external-ports.js';
import { parsePlainText } from '../../domain/ingestion-service/pipeline.js';

export class PlainDocumentParser implements IDocumentParserPort {
  parse(document: IDocumentDto, content: string): Promise<IParsedDocument> {
    return Promise.resolve(parsePlainText(document.title, content));
  }
}
