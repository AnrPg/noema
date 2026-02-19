/**
 * Forgot Password Page
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AuthLayout,
  AuthHeader,
  Card,
  CardContent,
  CardFooter,
  Button,
  Input,
  FormField,
  Alert,
  AlertDescription,
} from '@noema/ui';
import { AlertCircle, CheckCircle } from 'lucide-react';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    try {
      setError(null);
      // TODO: Implement password reset API call
      // await authApi.requestPasswordReset(data.email);
      console.log('Password reset requested for:', data.email);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  if (success) {
    return (
      <AuthLayout>
        <AuthHeader
          title="Check your email"
          description="We've sent you a password reset link"
        />

        <Card>
          <CardContent className="pt-6">
            <Alert variant="success">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                If an account exists with that email, you'll receive a password
                reset link shortly.
              </AlertDescription>
            </Alert>
          </CardContent>

          <CardFooter>
            <Link href="/login" className="w-full">
              <Button variant="outline" className="w-full">
                Back to login
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthHeader
        title="Forgot password?"
        description="Enter your email and we'll send you a reset link"
      />

      <Card>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4 pt-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <FormField
              label="Email"
              error={errors.email?.message}
              required
            >
              <Input
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                {...register('email')}
              />
            </FormField>
          </CardContent>

          <CardFooter className="flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Send reset link'}
            </Button>

            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-primary"
            >
              Back to login
            </Link>
          </CardFooter>
        </form>
      </Card>
    </AuthLayout>
  );
}
