export interface IServiceConfig {
  service: {
    name: string;
    version: string;
    environment: 'development' | 'staging' | 'production';
  };
  security: {
    offlineIntentTokenSecret: string;
    offlineIntentTokenIssuer: string;
    offlineIntentTokenAudience: string;
  };
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): IServiceConfig {
  const env = optionalEnv('NODE_ENV', 'development') as
    | 'development'
    | 'staging'
    | 'production';

  return {
    service: {
      name: optionalEnv('SERVICE_NAME', 'scheduler-service'),
      version: optionalEnv('SERVICE_VERSION', '0.1.0'),
      environment: env,
    },
    security: {
      offlineIntentTokenSecret: requireEnv('OFFLINE_INTENT_TOKEN_SECRET'),
      offlineIntentTokenIssuer: optionalEnv('OFFLINE_INTENT_TOKEN_ISSUER', 'noema.scheduler'),
      offlineIntentTokenAudience: optionalEnv('OFFLINE_INTENT_TOKEN_AUDIENCE', 'noema.mobile'),
    },
  };
}
