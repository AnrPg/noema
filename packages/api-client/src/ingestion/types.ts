export interface IIngestionDocumentDto {
  id: string;
  userId: string;
  title: string;
  sourceKind: string;
  mimeKind: string;
  sourceUri?: string | null;
  checksum: string;
  byteLength: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type IngestionDocumentsResponse = { data: IIngestionDocumentDto[] };
