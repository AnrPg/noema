/**
 * Card Templates Page
 *
 * Lists all card templates with type, created date, inline editing,
 * and a delete action with confirmation.
 */

'use client';

import * as React from 'react';
import { type JSX } from 'react';
import type { ITemplateDto } from '@noema/api-client';
import { useDeleteTemplate, useTemplates, useUpdateTemplate } from '@noema/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@noema/ui';
import { AlertCircle, Pencil, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { getRequestErrorDetails } from '@/lib/api-error';
import { formatDate, truncateId } from '@/lib/format';

type TemplateId = ITemplateDto['id'];
type TemplateDraft = {
  id: TemplateId;
  name: string;
  defaultContentJson: string;
};

function formatTemplateContent(content: Record<string, unknown>): string {
  return JSON.stringify(content, null, 2);
}

function buildDraft(template: ITemplateDto): TemplateDraft {
  return {
    id: template.id,
    name: template.name,
    defaultContentJson: formatTemplateContent(template.defaultContent),
  };
}

function parseTemplateContent(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Default content must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Template Row
// ---------------------------------------------------------------------------

function TemplateRow({
  template,
  isSelected,
  onSelect,
  onStartEdit,
  onDelete,
  deletingId,
}: {
  template: ITemplateDto;
  isSelected: boolean;
  onSelect: (template: ITemplateDto) => void;
  onStartEdit: (template: ITemplateDto) => void;
  onDelete: (id: TemplateId, callbacks: { onSuccess: () => void; onError: () => void }) => void;
  deletingId: string | null;
}): React.JSX.Element {
  const [confirming, setConfirming] = React.useState(false);
  const createdDate = formatDate(template.createdAt);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`flex w-full items-center justify-between gap-4 py-4 text-left transition-colors ${
        isSelected ? 'bg-accent/40' : 'hover:bg-accent/20'
      }`}
      onClick={() => {
        onSelect(template);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(template);
        }
      }}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        {/* Template ID */}
        <span
          className="font-mono text-xs text-muted-foreground shrink-0 w-36 truncate"
          title={template.id}
        >
          {truncateId(template.id)}
        </span>

        {/* Name */}
        <div className="min-w-0 flex-1">
          <span className="font-medium text-sm truncate block">{template.name}</span>
          <span className="text-xs text-muted-foreground truncate block">
            {Object.keys(template.defaultContent).length} content field
            {Object.keys(template.defaultContent).length === 1 ? '' : 's'}
          </span>
        </div>

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
              disabled={deletingId === template.id}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(template.id, {
                  onSuccess: () => {
                    setConfirming(false);
                  },
                  onError: () => {
                    setConfirming(false);
                  },
                });
              }}
            >
              Yes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                setConfirming(false);
              }}
            >
              No
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Edit template ${template.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onStartEdit(template);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              aria-label={`Delete template ${template.name}`}
              onClick={(event) => {
                event.stopPropagation();
                setConfirming(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TemplatesPage(): JSX.Element {
  const { data: templates, isLoading, isError, error, refetch, isFetching } = useTemplates({
    retry: false,
  });
  const deleteTemplate = useDeleteTemplate();
  const updateTemplate = useUpdateTemplate();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<TemplateId | null>(null);
  const [draft, setDraft] = React.useState<TemplateDraft | null>(null);
  const [editorError, setEditorError] = React.useState<string | null>(null);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  const items = templates ?? [];
  const errorDetails = isError
    ? getRequestErrorDetails(error, 'card templates', 'the content service')
    : null;

  const selectedTemplate =
    selectedId === null ? null : (items.find((template) => template.id === selectedId) ?? null);

  React.useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      setDraft(null);
      return;
    }

    if (selectedId === null) {
      setSelectedId(items[0]?.id ?? null);
      return;
    }

    const stillExists = items.some((template) => template.id === selectedId);
    if (!stillExists) {
      setSelectedId(items[0]?.id ?? null);
      setDraft(null);
    }
  }, [items, selectedId]);

  const handleDelete = (
    id: TemplateId,
    callbacks: { onSuccess: () => void; onError: () => void }
  ): void => {
    setDeletingId(id);
    deleteTemplate.mutate(id, {
      onSuccess: () => {
        setDeletingId(null);
        callbacks.onSuccess();
      },
      onError: () => {
        setDeletingId(null);
        callbacks.onError();
      },
    });
  };

  const startEditing = (template: ITemplateDto): void => {
    setSelectedId(template.id);
    setDraft(buildDraft(template));
    setEditorError(null);
    setSaveMessage(null);
  };

  const cancelEditing = (): void => {
    setDraft(null);
    setEditorError(null);
  };

  const handleSave = (): void => {
    if (draft === null) {
      return;
    }

    const trimmedName = draft.name.trim();
    if (trimmedName.length === 0) {
      setEditorError('Template name must not be empty.');
      return;
    }

    try {
      const parsedDefaultContent = parseTemplateContent(draft.defaultContentJson);
      setEditorError(null);
      setSaveMessage(null);
      updateTemplate.mutate(
        {
          id: draft.id,
          data: {
            name: trimmedName,
            defaultContent: parsedDefaultContent,
          },
        },
        {
          onSuccess: () => {
            setSaveMessage('Template updated.');
            setDraft((currentDraft) =>
              currentDraft === null
                ? currentDraft
                : {
                    ...currentDraft,
                    name: trimmedName,
                    defaultContentJson: formatTemplateContent(parsedDefaultContent),
                  }
            );
          },
          onError: (updateError) => {
            setEditorError(updateError.message || 'Failed to update template.');
          },
        }
      );
    } catch (parseError) {
      setEditorError(
        parseError instanceof Error ? parseError.message : 'Default content must be valid JSON.'
      );
    }
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
          <CardTitle>How Templates Fit</CardTitle>
          <CardDescription>
            Templates do not replace card-type schemas. They pre-fill those schemas with reusable
            starter content.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Each card type already has a fixed UI and validation shape in the app. A template sits
            one level above that: it stores a saved default payload for a chosen card type so authors
            can instantiate consistent cards without re-entering the same scaffolding every time.
          </p>
          <p>
            In practice, a template is a content blueprint: card type plus default fields like
            `front`, `back`, `hint`, `explanation`, and any additional type-specific keys. The page
            below now acts as both a catalog and an editor for those blueprints.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
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
            ) : isError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{errorDetails?.title}</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{errorDetails?.description}</p>
                  {errorDetails?.hint !== undefined && (
                    <p className="text-xs text-muted-foreground">{errorDetails.hint}</p>
                  )}
                  <div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void refetch();
                      }}
                      disabled={isFetching}
                      className="gap-2"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {isFetching ? 'Retrying…' : 'Retry'}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
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
                  <span className="shrink-0 w-24 text-right">Actions</span>
                </div>
                <div className="divide-y">
                  {items.map((template) => (
                    <TemplateRow
                      key={template.id}
                      template={template}
                      isSelected={template.id === selectedId}
                      onSelect={(selectedTemplateItem) => {
                        setSelectedId(selectedTemplateItem.id);
                      }}
                      onStartEdit={startEditing}
                      onDelete={handleDelete}
                      deletingId={deletingId}
                    />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{draft === null ? 'Template Details' : 'Edit Template'}</CardTitle>
            <CardDescription>
              {selectedTemplate === null
                ? 'Select a template to inspect it.'
                : draft === null
                  ? 'Click the row or the pencil icon to start editing.'
                  : 'Update the template name and its default content blueprint.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedTemplate === null ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                No template selected.
              </div>
            ) : draft === null ? (
              <div className="space-y-4 text-sm">
                <div className="rounded-lg border p-4">
                  <p className="font-medium">{selectedTemplate.name}</p>
                  <p className="mt-1 text-muted-foreground">
                    Card type: {selectedTemplate.cardType}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Created: {formatDate(selectedTemplate.createdAt)}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="template-default-content-preview">Default content blueprint</Label>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        startEditing(selectedTemplate);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </div>
                  <textarea
                    id="template-default-content-preview"
                    value={formatTemplateContent(selectedTemplate.defaultContent)}
                    readOnly
                    className="min-h-[360px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {editorError !== null && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Could not save template</AlertTitle>
                    <AlertDescription>{editorError}</AlertDescription>
                  </Alert>
                )}
                {saveMessage !== null && editorError === null && (
                  <Alert>
                    <AlertTitle>Saved</AlertTitle>
                    <AlertDescription>{saveMessage}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="template-name">Template name</Label>
                  <Input
                    id="template-name"
                    value={draft.name}
                    onChange={(event) => {
                      setDraft((currentDraft) =>
                        currentDraft === null
                          ? currentDraft
                          : { ...currentDraft, name: event.target.value }
                      );
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-card-type">Card type</Label>
                  <Input id="template-card-type" value={selectedTemplate.cardType} readOnly />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-default-content">Default content JSON</Label>
                  <textarea
                    id="template-default-content"
                    value={draft.defaultContentJson}
                    onChange={(event) => {
                      setDraft((currentDraft) =>
                        currentDraft === null
                          ? currentDraft
                          : {
                              ...currentDraft,
                              defaultContentJson: event.target.value,
                            }
                      );
                    }}
                    className="min-h-[360px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    This JSON is the starter payload that gets injected into the selected card type
                    schema when the template is used.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={updateTemplate.isPending}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {updateTemplate.isPending ? 'Saving…' : 'Save changes'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={cancelEditing}
                    disabled={updateTemplate.isPending}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
