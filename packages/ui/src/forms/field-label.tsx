import * as React from 'react';
import { cn } from '../lib/utils.js';
import { Label } from '../primitives/label.js';

export interface FieldLabelProps {
  children: React.ReactNode;
  required?: boolean | undefined;
  className?: string;
}

export function FieldLabel({
  children,
  required = false,
  className,
}: FieldLabelProps): React.JSX.Element {
  return (
    <Label className={cn(className)}>
      {children}
      {required ? (
        <span className="ml-1 text-destructive" aria-hidden="true">
          *
        </span>
      ) : null}
    </Label>
  );
}
