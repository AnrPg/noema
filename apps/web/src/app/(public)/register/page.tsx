/**
 * Register Page
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
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const registerSchema = z
  .object({
    email: z.string().email('Invalid email address'),
    displayName: z.string().min(2, 'Display name must be at least 2 characters'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setError(null);
      const username = data.email.split('@')[0] ?? data.email;
      await registerUser({
        username,
        email: data.email,
        password: data.password,
        ...(data.displayName && { displayName: data.displayName }),
      });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  return (
    <AuthLayout>
      <AuthHeader
        title="Create an account"
        description="Start your personalized learning journey"
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
                placeholder="you@example.com"
                autoComplete="email"
                {...register('email')}
              />
            </FormField>

            <FormField label="Display name" error={errors.displayName?.message} required>
              <Input placeholder="John Doe" autoComplete="name" {...register('displayName')} />
            </FormField>

            <FormField
              label="Password"
              error={errors.password?.message}
              description="At least 8 characters with uppercase, lowercase, and number"
              required
            >
              <PasswordInput
                placeholder="••••••••"
                autoComplete="new-password"
                {...register('password')}
              />
            </FormField>

            <FormField label="Confirm password" error={errors.confirmPassword?.message} required>
              <PasswordInput
                placeholder="••••••••"
                autoComplete="new-password"
                {...register('confirmPassword')}
              />
            </FormField>
          </CardContent>

          <CardFooter className="flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </Button>

            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </AuthLayout>
  );
}
