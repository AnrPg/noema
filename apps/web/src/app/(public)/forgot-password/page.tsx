/**
 * Forgot Password Page
 *
 * Sends a password reset request via authApi.requestPasswordReset().
 * Shows a success confirmation state after submission with the submitted
 * email address displayed. Implements anti-enumeration UX: the message is
 * identical whether or not the account exists.
 */

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRequestPasswordReset } from '@noema/api-client';
import {
  AuthHeader,
  AuthLayout,
  Button,
  Card,
  CardContent,
  CardFooter,
  FormField,
  Input,
} from '@noema/ui';
import { Brain, CheckCircle, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage(): React.JSX.Element {
  const [success, setSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const requestPasswordReset = useRequestPasswordReset();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = (data: ForgotPasswordFormData): void => {
    setSubmitError(null);
    requestPasswordReset.mutate(
      { email: data.email },
      {
        onSuccess: () => {
          setSubmittedEmail(data.email);
          setSuccess(true);
          reset();
        },
        onError: (err) => {
          setSubmitError(err.message);
        },
      }
    );
  };

  if (success) {
    return (
      <AuthLayout className="auth-neural-bg">
        <AuthHeader
          title="Check your email"
          description="We've sent you a password reset link"
          logo={
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neuron-400/10 shadow-[0_0_20px_hsl(var(--neuron-400)/0.3)]">
              <CheckCircle className="h-7 w-7 text-neuron-400" />
            </div>
          }
        />
        {/* aria-live announces the success state to screen readers on transition */}
        <div aria-live="polite" aria-atomic="true" className="animate-auth-card">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                If an account exists for{' '}
                <span className="font-medium text-foreground">{submittedEmail}</span>, you will
                receive a password reset link shortly. Check your spam folder if you don&apos;t see
                it within a few minutes.
              </p>
            </CardContent>
            <CardFooter className="flex-col gap-3">
              <Link href="/login" className="w-full">
                <Button className="w-full">Back to sign in</Button>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setSuccess(false);
                  reset();
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Try a different email
              </button>
            </CardFooter>
          </Card>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout className="auth-neural-bg">
      <AuthHeader
        title="Forgot password?"
        description="Enter your email and we'll send you a reset link"
        logo={
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-synapse-400/10 shadow-[0_0_20px_hsl(var(--synapse-400)/0.3)]">
            <Brain className="h-7 w-7 text-synapse-400" />
          </div>
        }
      />
      <div className="animate-auth-card">
        <Card>
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
            <CardContent className="space-y-4 pt-6">
              <FormField label="Email address" error={errors.email?.message} required>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  {...register('email')}
                />
              </FormField>
              {submitError !== null && (
                <p role="alert" className="text-sm text-destructive">
                  {submitError}
                </p>
              )}
            </CardContent>
            <CardFooter className="flex-col gap-4">
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || requestPasswordReset.isPending}
              >
                <Mail className="mr-2 h-4 w-4" />
                {requestPasswordReset.isPending ? 'Sending...' : 'Send reset link'}
              </Button>
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to sign in
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </AuthLayout>
  );
}
