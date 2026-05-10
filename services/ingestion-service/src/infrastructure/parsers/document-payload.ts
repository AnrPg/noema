import type { IDocumentDto } from '@noema/contracts';

export interface IResolvedDocumentPayload {
  content: string;
  encoding: 'text' | 'base64';
  bytes: Buffer;
  mimeKind: string;
}

export function resolveDocumentPayload(
  document: Pick<IDocumentDto, 'mimeKind' | 'metadata'>,
  content: string
): IResolvedDocumentPayload {
  const metadata = document.metadata;
  const declaredEncoding = metadata['contentEncoding'];
  const dataUrlMatch = /^data:([^;,]+)?;base64,([\s\S]+)$/i.exec(content.trim());

  if (dataUrlMatch !== null) {
    const mimeKind = (dataUrlMatch[1] ?? document.mimeKind).trim();
    const base64Content = dataUrlMatch[2] ?? '';
    return {
      content: base64Content,
      encoding: 'base64',
      bytes: decodeBase64(base64Content),
      mimeKind,
    };
  }

  if (declaredEncoding === 'base64') {
    return {
      content,
      encoding: 'base64',
      bytes: decodeBase64(content),
      mimeKind: document.mimeKind,
    };
  }

  return {
    content,
    encoding: 'text',
    bytes: Buffer.from(content, 'utf8'),
    mimeKind: document.mimeKind,
  };
}

function decodeBase64(content: string): Buffer {
  const normalized = content.replace(/\s+/g, '');
  return Buffer.from(normalized, 'base64');
}
