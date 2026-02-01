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

export default function LoginScreen() {
  const colors = useColors();
  const { login, isLoading, error, clearError } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleLogin = async () => {
    setLocalError('');
    
    if (!email.trim()) {
      setLocalError('Please enter your email');
      return;
    }
    if (!password) {
      setLocalError('Please enter your password');
      return;
    }

    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch (err: any) {
      setLocalError(err.message || 'Login failed');
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
            {/* Logo/Brand */}
            <View style={{ alignItems: 'center', marginBottom: 48 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 20,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 36 }}>🧠</Text>
              </View>
              <Text
                style={{
                  fontSize: 32,
                  fontWeight: 'bold',
                  color: colors.text,
                  letterSpacing: -0.5,
                }}
              >
                Manthanein
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  color: colors.textSecondary,
                  marginTop: 8,
                }}
              >
                Master your memory
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
            <View style={{ marginBottom: 24 }}>
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

            {/* Forgot Password */}
            <Link href="/(auth)/forgot-password" asChild>
              <TouchableOpacity style={{ alignSelf: 'flex-end', marginBottom: 24 }}>
                <Text style={{ color: colors.primary, fontWeight: '500' }}>
                  Forgot password?
                </Text>
              </TouchableOpacity>
            </Link>

            {/* Login Button */}
            <TouchableOpacity
              onPress={handleLogin}
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
                  Sign in
                </Text>
              )}
            </TouchableOpacity>

            {/* Register Link */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                marginTop: 24,
              }}
            >
              <Text style={{ color: colors.textSecondary }}>
                Don't have an account?{' '}
              </Text>
              <Link href="/(auth)/register" asChild>
                <TouchableOpacity>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>
                    Sign up
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
