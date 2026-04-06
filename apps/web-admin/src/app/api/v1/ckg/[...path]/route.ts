import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const KNOWLEDGE_GRAPH_BASE_URL = 'http://localhost:3006';

function buildErrorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        serviceName: 'web-admin',
        serviceVersion: '0.1.0',
      },
    },
    { status }
  );
}

async function forwardRequest(
  request: NextRequest,
  context: { params: { path: string[] } }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const authHeader = request.headers.get('authorization');

  if (authHeader === null || authHeader.trim() === '') {
    return buildErrorResponse(
      requestId,
      401,
      'AUTHENTICATION_ERROR',
      'Missing or invalid authorization header'
    );
  }

  const upstreamPath = context.params.path.join('/');
  const upstreamUrl = new URL(
    `/api/v1/ckg/${upstreamPath}${request.nextUrl.search}`,
    KNOWLEDGE_GRAPH_BASE_URL
  );

  const headers = new Headers();
  headers.set('authorization', authHeader);

  const accept = request.headers.get('accept');
  if (accept !== null) {
    headers.set('accept', accept);
  }

  const contentType = request.headers.get('content-type');
  if (contentType !== null) {
    headers.set('content-type', contentType);
  }

  try {
    const init: RequestInit = {
      method: request.method,
      headers,
      cache: 'no-store',
      redirect: 'manual',
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.text();
    }

    const upstreamResponse = await fetch(upstreamUrl, init);

    const responseHeaders = new Headers();
    const upstreamContentType = upstreamResponse.headers.get('content-type');
    if (upstreamContentType !== null) {
      responseHeaders.set('content-type', upstreamContentType);
    }

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return buildErrorResponse(
      requestId,
      503,
      'UPSTREAM_UNAVAILABLE',
      'Knowledge graph service is unavailable'
    );
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: { path: string[] } }
): Promise<NextResponse> {
  return forwardRequest(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: { path: string[] } }
): Promise<NextResponse> {
  return forwardRequest(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: { path: string[] } }
): Promise<NextResponse> {
  return forwardRequest(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: { path: string[] } }
): Promise<NextResponse> {
  return forwardRequest(request, context);
}
