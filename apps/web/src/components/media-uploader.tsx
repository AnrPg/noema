'use client';

/**
 * @noema/web - MediaUploader
 *
 * File upload component implementing the presigned PUT flow:
 *   1. Request a presigned upload URL from the API
 *   2. PUT the file directly to that URL via XMLHttpRequest (no Authorization header)
 *   3. Confirm the upload with the API to obtain the canonical public URL
 *
 * CRITICAL: The PUT to the presigned URL uses XMLHttpRequest (not the API client)
 * because adding an Authorization header to a presigned PUT invalidates the
 * signature — the signer only includes specific headers. See ADR-007 D5.
 */

import * as React from 'react';
import { useConfirmUpload, useRequestUploadUrl } from '@noema/api-client';

// ============================================================================
// Interfaces
// ============================================================================

export interface IMediaUploaderProps {
  onUploadComplete: (mediaUrl: string, mediaId: string) => void;
  onError?: (error: Error) => void;
  /** MIME type accept string, e.g. "image/*,audio/*". Defaults to "image/*,audio/*,video/*". */
  acceptedTypes?: string;
  /** Maximum file size in megabytes. Defaults to 50. */
  maxFileSizeMb?: number;
  className?: string;
}

// ============================================================================
// Upload state machine
// ============================================================================

type UploadStatus = 'idle' | 'selected' | 'uploading' | 'success' | 'error';

interface IUploadState {
  status: UploadStatus;
  file: File | null;
  progress: number;
  errorMessage: string | null;
  resultUrl: string | null;
  resultMediaId: string | null;
}

const INITIAL_STATE: IUploadState = {
  status: 'idle',
  file: null,
  progress: 0,
  errorMessage: null,
  resultUrl: null,
  resultMediaId: null,
};

// ============================================================================
// Helpers
// ============================================================================

const DEFAULT_ACCEPT = 'image/*,audio/*,video/*';
const DEFAULT_MAX_MB = 50;
const BYTES_PER_MB = 1_048_576;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return String(bytes) + ' B';
  if (bytes < BYTES_PER_MB) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / BYTES_PER_MB).toFixed(1) + ' MB';
}

/**
 * Upload a file to a presigned PUT URL using XMLHttpRequest so that
 * upload progress events are available. No Authorization header is attached —
 * the presigned URL is self-authorizing and adding extra headers breaks the
 * signature verification.
 */
function xhrUpload(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    signal.addEventListener('abort', () => {
      xhr.abort();
      reject(new Error('Upload aborted'));
    });

    xhr.upload.onprogress = (e: ProgressEvent): void => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = (): void => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error('Upload failed with status ' + String(xhr.status)));
      }
    };

    xhr.onerror = (): void => {
      reject(new Error('Network error during upload'));
    };

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

// ============================================================================
// Component
// ============================================================================

export function MediaUploader({
  onUploadComplete,
  onError,
  acceptedTypes = DEFAULT_ACCEPT,
  maxFileSizeMb = DEFAULT_MAX_MB,
  className,
}: IMediaUploaderProps): React.JSX.Element {
  const [state, setState] = React.useState<IUploadState>(INITIAL_STATE);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const isDraggingRef = React.useRef(false);
  const [isDragging, setIsDragging] = React.useState(false);

  const requestUploadUrl = useRequestUploadUrl();
  const confirmUpload = useConfirmUpload();

  // Abort any in-progress XHR on unmount
  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // -------------------------------------------------------------------------
  // File validation + selection
  // -------------------------------------------------------------------------

  function handleFileSelected(file: File): void {
    const maxBytes = maxFileSizeMb * BYTES_PER_MB;
    if (file.size > maxBytes) {
      const msg = 'File is too large. Maximum size is ' + String(maxFileSizeMb) + ' MB.';
      setState({ ...INITIAL_STATE, status: 'error', errorMessage: msg });
      onError?.(new Error(msg));
      return;
    }
    setState({ ...INITIAL_STATE, status: 'selected', file });
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file !== undefined) handleFileSelected(file);
    // Reset input value so the same file can be re-selected after an error
    e.target.value = '';
  }

  // -------------------------------------------------------------------------
  // Drag and drop
  // -------------------------------------------------------------------------

  function handleDragOver(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      setIsDragging(true);
    }
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    isDraggingRef.current = false;
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    isDraggingRef.current = false;
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file !== undefined) handleFileSelected(file);
  }

  // -------------------------------------------------------------------------
  // Upload flow
  // -------------------------------------------------------------------------

  async function startUpload(): Promise<void> {
    if (state.file === null) return;

    const file = state.file;

    // Cancel any previous upload in flight
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((prev) => ({ ...prev, status: 'uploading', progress: 0, errorMessage: null }));

    try {
      // Step 1: Request presigned upload URL
      const urlResponse = await requestUploadUrl.mutateAsync({
        filename: file.name,
        mimeType: file.type,
      });

      const { uploadUrl, mediaId } = urlResponse.data;

      // Step 2: PUT the file directly to the presigned URL (no API client)
      await xhrUpload(
        uploadUrl,
        file,
        (percent) => {
          setState((prev) => ({ ...prev, progress: percent }));
        },
        controller.signal
      );

      // Step 3: Confirm the upload with the API
      const confirmResponse = await confirmUpload.mutateAsync(mediaId);

      const publicUrl = confirmResponse.data.url;
      const confirmedMediaId = confirmResponse.data.id;

      setState((prev) => ({
        ...prev,
        status: 'success',
        progress: 100,
        resultUrl: publicUrl,
        resultMediaId: confirmedMediaId,
      }));

      onUploadComplete(publicUrl, confirmedMediaId);
    } catch (err) {
      if (controller.signal.aborted) return;

      const error = err instanceof Error ? err : new Error('Upload failed');
      setState((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: error.message,
      }));
      onError?.(error);
    }
  }

  function handleRetry(): void {
    setState((prev) => ({
      ...INITIAL_STATE,
      status: prev.file !== null ? 'selected' : 'idle',
      file: prev.file,
    }));
  }

  function handleReset(): void {
    abortControllerRef.current?.abort();
    setState(INITIAL_STATE);
  }

  // -------------------------------------------------------------------------
  // Derived UI values
  // -------------------------------------------------------------------------

  const { status, file, progress, errorMessage, resultUrl } = state;
  const isUploading = status === 'uploading';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className={className}>
      {/* ------------------------------------------------------------------ */}
      {/* IDLE — drag-drop zone */}
      {/* ------------------------------------------------------------------ */}
      {status === 'idle' && (
        <div
          role="presentation"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={[
            'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors',
            isDragging
              ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/20'
              : 'border-zinc-300 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-zinc-600',
          ].join(' ')}
        >
          {/* Upload icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-zinc-400 dark:text-zinc-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>

          <div className="text-center">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Drag and drop a file here
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              {'or '}
              <button
                type="button"
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
              >
                choose a file
              </button>
              {' — up to ' + String(maxFileSizeMb) + ' MB'}
            </p>
          </div>

          <input
            name="mediaUpload"
            ref={fileInputRef}
            type="file"
            accept={acceptedTypes}
            onChange={handleInputChange}
            className="sr-only"
            aria-label="File upload input"
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* SELECTED — file ready, waiting for user to confirm */}
      {/* ------------------------------------------------------------------ */}
      {status === 'selected' && file !== null && (
        <div className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <FileIcon mimeType={file.type} />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {file.name}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">{formatFileSize(file.size)}</p>
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void startUpload();
              }}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              Upload
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* UPLOADING — progress bar */}
      {/* ------------------------------------------------------------------ */}
      {isUploading && file !== null && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-3 flex items-center gap-3">
            <FileIcon mimeType={file.type} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {file.name}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                {String(progress) + '% uploaded'}
              </p>
            </div>
            {/* Spinner for the confirm step: progress hit 100 but confirm hasn't resolved */}
            {progress >= 100 && (
              <svg
                className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-label="Confirming upload"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
          </div>

          {/* Progress bar */}
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={'Upload progress: ' + String(progress) + '%'}
            className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
          >
            <div
              className="h-full rounded-full bg-indigo-600 transition-[width] duration-150 dark:bg-indigo-500"
              style={{ width: String(progress) + '%' }}
            />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* SUCCESS */}
      {/* ------------------------------------------------------------------ */}
      {status === 'success' && file !== null && (
        <div className="flex items-center gap-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
          {/* Checkmark */}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-green-600 dark:text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-green-800 dark:text-green-300">
              {file.name}
            </p>
            {resultUrl !== null && (
              <p className="truncate text-xs text-green-700 dark:text-green-500">{resultUrl}</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="shrink-0 rounded px-2 py-1 text-xs text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/40"
          >
            Upload another
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* ERROR */}
      {/* ------------------------------------------------------------------ */}
      {status === 'error' && (
        <div className="flex items-start gap-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
          {/* Error icon */}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">Upload failed</p>
            {errorMessage !== null && (
              <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">{errorMessage}</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleRetry}
            className="shrink-0 rounded bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FileIcon — simple mime-type icon
// ============================================================================

interface IFileIconProps {
  mimeType: string;
}

function FileIcon({ mimeType }: IFileIconProps): React.JSX.Element {
  const isImage = mimeType.startsWith('image/');
  const isAudio = mimeType.startsWith('audio/');
  const isVideo = mimeType.startsWith('video/');

  let iconPath: string;
  let colorClass: string;

  if (isImage) {
    iconPath =
      'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z';
    colorClass = 'text-blue-500 dark:text-blue-400';
  } else if (isAudio) {
    iconPath =
      'M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z';
    colorClass = 'text-purple-500 dark:text-purple-400';
  } else if (isVideo) {
    iconPath =
      'M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z';
    colorClass = 'text-orange-500 dark:text-orange-400';
  } else {
    iconPath =
      'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z';
    colorClass = 'text-zinc-500 dark:text-zinc-400';
  }

  return (
    <span
      className={[
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800',
        colorClass,
      ].join(' ')}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
      </svg>
    </span>
  );
}
