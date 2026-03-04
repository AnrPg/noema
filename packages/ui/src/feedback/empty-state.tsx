/**
 * @noema/ui - EmptyState
 *
 * Zero-state placeholder with optional icon, description, and action button.
 */
import type { JSX, ReactNode } from 'react';
import { cn } from '../lib/utils.js';
import { Button } from '../primitives/button.js';

interface IEmptyStateAction {
  label: string;
  onClick: () => void;
}

interface IEmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: IEmptyStateAction;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: IEmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 p-8 animate-fade-slide-in',
        className
      )}
    >
      {icon !== undefined && <div className="text-axon-200 text-4xl">{icon}</div>}
      <div className="flex flex-col items-center gap-2 text-center">
        <h3 className="text-card-title text-foreground">{title}</h3>
        {description !== undefined && (
          <p className="text-body text-axon-400 max-w-sm">{description}</p>
        )}
      </div>
      {action !== undefined && (
        <Button onClick={action.onClick} variant="default">
          {action.label}
        </Button>
      )}
    </div>
  );
}
