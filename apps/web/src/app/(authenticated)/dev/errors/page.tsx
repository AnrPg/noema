'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { AlertTriangle, Bug, Search } from 'lucide-react';
import { useState } from 'react';
import { ErrorPageScene } from '@/components/error-page-scene';

type PreviewVariant = 'not-found' | 'error';

export default function ErrorPreviewPage(): React.JSX.Element {
  const [variant, setVariant] = useState<PreviewVariant>('not-found');
  const [shouldThrow, setShouldThrow] = useState(false);

  // Dev-only route — return nothing in production; Next.js middleware handles 404
  if (process.env.NODE_ENV === 'production') {
    return <></>;
  }

  if (shouldThrow) {
    throw new Error('Preview crash: the cortex dropped a stack of thoughts on purpose.');
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card/60 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-page-title text-synapse-400">Error Page Preview</h1>
            <p className="mt-2 text-body text-muted-foreground">
              Dev-only playground for the new full-screen Noema error experiences.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant={variant === 'not-found' ? 'default' : 'outline'}
              onClick={() => {
                setShouldThrow(false);
                setVariant('not-found');
              }}
            >
              <Search className="mr-2 h-4 w-4" />
              Preview 404
            </Button>
            <Button
              type="button"
              variant={variant === 'error' ? 'default' : 'outline'}
              onClick={() => {
                setShouldThrow(false);
                setVariant('error');
              }}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Preview 500
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setShouldThrow(true);
              }}
            >
              <Bug className="mr-2 h-4 w-4" />
              Trigger real boundary
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-5">
        <Card className="border-border/70 bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">How to inspect</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
            <p>
              `404` preview: open this page and click <strong>Preview 404</strong>.
            </p>
            <p>
              `500` preview: click <strong>Preview 500</strong> for the designed scene.
            </p>
            <p>
              Real error boundary: click <strong>Trigger real boundary</strong> to make the route
              actually throw and render [error.tsx].
            </p>
          </CardContent>
        </Card>
      </div>

      <ErrorPageScene
        variant={variant}
        {...(variant === 'error'
          ? {
              error: Object.assign(new Error('Preview runtime wobble detected.'), {
                digest: 'preview-runtime-wobble',
              }),
            }
          : {})}
        onRetry={() => {
          setShouldThrow(false);
          setVariant('error');
        }}
      />
    </div>
  );
}
