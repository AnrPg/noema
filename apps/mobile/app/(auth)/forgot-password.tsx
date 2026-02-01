import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Link, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/theme/ThemeProvider';
import { apiClient } from '@/services/api';

export default function ForgotPasswordScreen() {
  const colors = useColors();
  
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleResetPassword = async () => {
    setError('');
    
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    setIsLoading(true);
    
    try {
      await apiClient.post('/auth/forgot-password', { email: email.trim() });
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <LinearGradient
        colors={[colors.background, colors.surface]}
        style={{ flex: 1, justifyContent: 'center', padding: 24 }}
      >
        <View style={{ alignItems: 'center' }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: colors.successLight,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
            }}
          >
            <Text style={{ fontSize: 36 }}>✉️</Text>
          </View>
          <Text
            style={{
              fontSize: 24,
              fontWeight: 'bold',
              color: colors.text,
              marginBottom: 8,
            }}
          >
            Check your email
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: colors.textSecondary,
              textAlign: 'center',
              marginBottom: 32,
            }}
          >
            We've sent password reset instructions to {email}
          </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity
              style={{
                backgroundColor: colors.primary,
                borderRadius: 12,
                padding: 16,
                paddingHorizontal: 32,
              }}
            >
              <Text style={{ color: colors.onPrimary, fontWeight: '600' }}>
                Back to Sign in
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[colors.background, colors.surface]}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ padding: 24 }}>
            {/* Header */}
            <View style={{ alignItems: 'center', marginBottom: 32 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: colors.primaryLight,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 36 }}>🔐</Text>
              </View>
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: 'bold',
                  color: colors.text,
                  letterSpacing: -0.5,
                }}
              >
                Forgot Password?
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  color: colors.textSecondary,
                  marginTop: 8,
                  textAlign: 'center',
                }}
              >
                Enter your email and we'll send you instructions to reset your password
              </Text>
            </View>

            {/* Error Message */}
            {error && (
              <View
                style={{
                  backgroundColor: colors.errorLight,
                  padding: 12,
                  borderRadius: 12,
                  marginBottom: 16,
                }}
              >
                <Text style={{ color: colors.error, textAlign: 'center' }}>
                  {error}
                </Text>
              </View>
            )}

            {/* Email Input */}
            <View style={{ marginBottom: 24 }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  marginBottom: 8,
                  fontWeight: '500',
                }}
              >
                Email
              </Text>
              <TextInput
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError('');
                }}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: 16,
                  fontSize: 16,
                  color: colors.text,
                }}
              />
            </View>

            {/* Reset Button */}
            <TouchableOpacity
              onPress={handleResetPassword}
              disabled={isLoading}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text
                  style={{
                    color: colors.onPrimary,
                    fontSize: 16,
                    fontWeight: '600',
                  }}
                >
                  Send Reset Link
                </Text>
              )}
            </TouchableOpacity>

            {/* Back to Login */}
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity
                style={{
                  marginTop: 24,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: colors.primary, fontWeight: '600' }}>
                  ← Back to Sign in
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
