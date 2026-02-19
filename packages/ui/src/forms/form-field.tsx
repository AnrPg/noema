/**
 * @noema/ui - Form Field Component
 *
 * Wrapper for form fields with label and error display.
 */

import * as React from 'react';
import { cn } from '../lib/utils.js';
import { Label } from '../primitives/label.js';

export interface FormFieldProps {
  label?: string;
  error?: string | undefined;
  description?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  error,
  description,
  required,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <Label className={cn(error && 'text-destructive')}>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      {children}
      {description && !error && <p className="text-sm text-muted-foreground">{description}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
