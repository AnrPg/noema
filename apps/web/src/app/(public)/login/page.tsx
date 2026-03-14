/**
 * Login Page
 */

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@noema/auth';
import {
  Alert,
  AlertDescription,
  AuthHeader,
  AuthLayout,
  Button,
  Card,
  CardContent,
  CardFooter,
  FormField,
  Input,
  PasswordInput,
} from '@noema/ui';
import { AlertCircle, Brain } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData): Promise<void> => {
    try {
      setError(null);
      await login({ identifier: data.email, password: data.password });
      const redirect = searchParams.get('redirect');
      const target =
        redirect !== null && redirect.startsWith('/') && !redirect.startsWith('//')
          ? redirect
          : '/dashboard';
      router.push(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <AuthLayout className="auth-neural-bg">
      <AuthHeader
        title="Welcome back"
        description="Sign in to your Noema account"
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
              {error !== null && error !== '' && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <FormField label="Email" error={errors.email?.message} required>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  {...register('email')}
                />
              </FormField>

              <FormField label="Password" error={errors.password?.message} required>
                <PasswordInput
                  placeholder="Enter password"
                  autoComplete="current-password"
                  {...register('password')}
                />
              </FormField>

              <div className="flex justify-end">
                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
            </CardContent>

            <CardFooter className="flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </Button>

              <Button variant="outline" className="w-full" asChild>
                <Link href="/register">Don&apos;t have an account? Sign up</Link>
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </AuthLayout>
  );
}
