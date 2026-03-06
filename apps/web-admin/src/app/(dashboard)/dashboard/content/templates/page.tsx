/**
 * Card Templates Page
 *
 * Lists all card templates with type, created date, and a delete action
 * with inline confirmation.
 */

'use client';

import * as React from 'react';
import { type JSX } from 'react';
import type { ITemplateDto } from '@noema/api-client';
import { useDeleteTemplate, useTemplates } from '@noema/api-client';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@noema/ui';
import { Trash2 } from 'lucide-react';

type TemplateId = ITemplateDto['id'];

// ---------------------------------------------------------------------------
// Template Row
// ---------------------------------------------------------------------------

function TemplateRow({
  template,
  onDelete,
  isDeleting,
}: {
  template: ITemplateDto;
  onDelete: (id: TemplateId) => void;
  isDeleting: boolean;
}): React.JSX.Element {
  const [confirming, setConfirming] = React.useState(false);
  const createdDate = new Date(template.createdAt).toLocaleDateString();

  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        {/* Template ID */}
        <span
          className="font-mono text-xs text-muted-foreground shrink-0 w-36 truncate"
          title={template.id}
        >
          {template.id.length > 14
            ? template.id.slice(0, 10) + '…' + template.id.slice(-4)
            : template.id}
        </span>

        {/* Name */}
        <span className="font-medium text-sm truncate">{template.name}</span>

        {/* Card type badge */}
        <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20">
          {template.cardType}
        </span>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {/* Created date */}
        <span className="text-xs text-muted-foreground hidden sm:block">{createdDate}</span>

        {/* Delete action */}
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-destructive">Delete?</span>
            <Button
              size="sm"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => {
                onDelete(template.id);
                setConfirming(false);
              }}
            >
              Yes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirming(false);
              }}
            >
              No
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TemplatesPage(): JSX.Element {
  const { data: templates, isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();

  const items = templates ?? [];

  const handleDelete = (id: TemplateId): void => {
    deleteTemplate.mutate(id);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Card Templates</h1>
        <p className="text-muted-foreground mt-1">
          Manage reusable card templates for content creation.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>
            {isLoading
              ? 'Loading…'
              : `${String(items.length)} template${items.length !== 1 ? 's' : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading templates…</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No templates found.</div>
          ) : (
            <>
              {/* Column headers */}
              <div className="flex items-center gap-4 pb-2 border-b text-xs font-medium text-muted-foreground">
                <span className="w-36 shrink-0">ID</span>
                <span className="flex-1 min-w-0">Name</span>
                <span className="shrink-0">Card Type</span>
                <span className="hidden sm:block shrink-0 w-20 text-right">Created</span>
                <span className="shrink-0 w-20 text-right">Actions</span>
              </div>
              <div className="divide-y">
                {items.map((template) => (
                  <TemplateRow
                    key={template.id}
                    template={template}
                    onDelete={handleDelete}
                    isDeleting={deleteTemplate.isPending}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
