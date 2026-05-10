import { http } from '../client.js';
import type { IngestionDocumentsResponse } from './types.js';

export const ingestionApi = {
  listDocuments: (): Promise<IngestionDocumentsResponse> => http.get('/v1/documents'),
};
