import { createHash } from 'node:crypto';

export interface IEmbeddingModel {
  readonly model: string;
  readonly dimensions: number;
  embed(text: string): number[];
}

export class HashEmbeddingModel implements IEmbeddingModel {
  constructor(
    readonly dimensions: number,
    readonly model = 'noema-hash-embedding-v1'
  ) {}

  embed(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const tokens = normalize(text).split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      const hash = createHash('sha256').update(token).digest();
      const index = hash.readUInt32BE(0) % this.dimensions;
      const sign = (hash[4] ?? 0) % 2 === 0 ? 1 : -1;
      vector[index] = (vector[index] ?? 0) + sign * Math.log1p(token.length);
    }

    return normalizeVector(vector);
  }
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}
