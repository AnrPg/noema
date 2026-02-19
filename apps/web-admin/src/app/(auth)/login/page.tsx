/**
 * Admin Login Page
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
import { AlertCircle, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setError(null);
      await login({ identifier: data.email, password: data.password });
      // TODO: Check if user has admin role
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <AuthLayout>
      <AuthHeader
        logo={<Shield className="h-12 w-12 text-primary" />}
        title="Admin Portal"
        description="Sign in to access the admin dashboard"
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

            <FormField label="Email" error={errors.email?.message} required>
              <Input
                type="email"
                placeholder="admin@example.com"
                autoComplete="email"
                {...register('email')}
              />
            </FormField>

            <FormField label="Password" error={errors.password?.message} required>
              <PasswordInput
                placeholder="••••••••"
                autoComplete="current-password"
                {...register('password')}
              />
            </FormField>
          </CardContent>

          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </AuthLayout>
  );
}
