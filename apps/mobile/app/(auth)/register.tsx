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
import { useAuthStore } from '@/stores/auth.store';
import { useColors } from '@/theme/ThemeProvider';

export default function RegisterScreen() {
  const colors = useColors();
  const { register, isLoading, error, clearError } = useAuthStore();
  
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleRegister = async () => {
    setLocalError('');
    
    if (!displayName.trim()) {
      setLocalError('Please enter your name');
      return;
    }
    if (!email.trim()) {
      setLocalError('Please enter your email');
      return;
    }
    if (!password) {
      setLocalError('Please enter a password');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    try {
      await register(email.trim(), password, displayName.trim());
      router.replace('/(tabs)');
    } catch (err: any) {
      setLocalError(err.message || 'Registration failed');
    }
  };

  const displayError = localError || error;

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
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: 'bold',
                  color: colors.text,
                  letterSpacing: -0.5,
                }}
              >
                Create Account
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  color: colors.textSecondary,
                  marginTop: 8,
                }}
              >
                Start your learning journey
              </Text>
            </View>

            {/* Error Message */}
            {displayError && (
              <View
                style={{
                  backgroundColor: colors.errorLight,
                  padding: 12,
                  borderRadius: 12,
                  marginBottom: 16,
                }}
              >
                <Text style={{ color: colors.error, textAlign: 'center' }}>
                  {displayError}
                </Text>
              </View>
            )}

            {/* Display Name Input */}
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  marginBottom: 8,
                  fontWeight: '500',
                }}
              >
                Display Name
              </Text>
              <TextInput
                value={displayName}
                onChangeText={(text) => {
                  setDisplayName(text);
                  clearError();
                }}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
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

            {/* Email Input */}
            <View style={{ marginBottom: 16 }}>
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
                  clearError();
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

            {/* Password Input */}
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  marginBottom: 8,
                  fontWeight: '500',
                }}
              >
                Password
              </Text>
              <TextInput
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  clearError();
                }}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
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

            {/* Confirm Password Input */}
            <View style={{ marginBottom: 24 }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  marginBottom: 8,
                  fontWeight: '500',
                }}
              >
                Confirm Password
              </Text>
              <TextInput
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  clearError();
                }}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
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

            {/* Register Button */}
            <TouchableOpacity
              onPress={handleRegister}
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
                  Create Account
                </Text>
              )}
            </TouchableOpacity>

            {/* Login Link */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                marginTop: 24,
              }}
            >
              <Text style={{ color: colors.textSecondary }}>
                Already have an account?{' '}
              </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>
                    Sign in
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
