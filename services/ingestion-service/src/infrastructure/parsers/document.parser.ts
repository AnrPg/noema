import type { IDocumentDto } from '@noema/contracts';
import type { IDocumentParserPort, IParsedDocument } from '../../domain/ingestion-service/external-ports.js';
import { PythonBackedDocumentParser } from './python-document-extractor.js';

export class DocumentParser implements IDocumentParserPort {
  constructor(private readonly parser = new PythonBackedDocumentParser()) {}

  parse(document: IDocumentDto, content: string): Promise<IParsedDocument> {
    return this.parser.parse(document, content);
  }
}
