/**
 * Password Strength Indicator Component
 *
 * Visual strength bar with requirement checklist.
 * Mirrors the server's PasswordSchema validation rules:
 * - Min 8 characters
 * - Lowercase letter
 * - Uppercase letter
 * - Number
 * - Special character
 */

'use client';

import { Check, X } from 'lucide-react';

interface IPasswordStrengthProps {
  password: string;
}

interface IPasswordRequirement {
  label: string;
  test: (pw: string) => boolean;
}

const REQUIREMENTS: IPasswordRequirement[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'Lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'Uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'Number', test: (pw) => /[0-9]/.test(pw) },
  {
    label: 'Special character (!@#$%...)',
    test: (pw) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw),
  },
];

/** Compute password strength score 0-100 matching server's Password.getStrength() */
function computeStrength(pw: string): number {
  if (pw === '') return 0;
  let score = 0;
  if (pw.length >= 8) score += 20;
  if (pw.length >= 12) score += 20;
  if (pw.length >= 16) score += 10;
  if (/[a-z]/.test(pw)) score += 10;
  if (/[A-Z]/.test(pw)) score += 10;
  if (/[0-9]/.test(pw)) score += 10;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw)) score += 20;
  return Math.min(score, 100);
}

function getStrengthLabel(score: number): { label: string; color: string } {
  if (score === 0) return { label: '', color: '' };
  if (score < 30) return { label: 'Very weak', color: 'bg-red-500' };
  if (score < 50) return { label: 'Weak', color: 'bg-orange-500' };
  if (score < 70) return { label: 'Fair', color: 'bg-yellow-500' };
  if (score < 90) return { label: 'Strong', color: 'bg-green-500' };
  return { label: 'Very strong', color: 'bg-emerald-500' };
}

export function PasswordStrength({ password }: IPasswordStrengthProps): React.JSX.Element | null {
  const strength = computeStrength(password);
  const { label, color } = getStrengthLabel(strength);
  const metCount = REQUIREMENTS.filter((r) => r.test(password)).length;

  if (password === '') return null;

  return (
    <div className="space-y-2 pt-1">
      {/* Strength bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex gap-1 flex-1">
            {[0, 1, 2, 3, 4].map((segment) => (
              <div
                key={segment}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                  segment < metCount ? color : 'bg-muted'
                }`}
              />
            ))}
          </div>
          {label !== '' && (
            <span className="text-xs text-muted-foreground ml-3 shrink-0">{label}</span>
          )}
        </div>
      </div>

      {/* Requirements checklist */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {REQUIREMENTS.map((req) => {
          const met = req.test(password);
          return (
            <li key={req.label} className="flex items-center gap-1.5 text-xs">
              {met ? (
                <Check className="h-3 w-3 text-green-500 shrink-0" />
              ) : (
                <X className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              )}
              <span className={met ? 'text-muted-foreground' : 'text-muted-foreground/50'}>
                {req.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
