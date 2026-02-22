# User Service

User management, authentication, and authorization service for the Noema
platform.

## Features

- User registration and profile management
- JWT-based authentication (access + refresh tokens)
- Role-based authorization
- User settings and preferences
- Account security (lockout, password policies)

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your values

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout
- `POST /api/v1/auth/logout-all` - Logout all devices

### Users

- `GET /api/v1/users` - List users (admin)
- `GET /api/v1/users/:id` - Get user by ID
- `PATCH /api/v1/users/:id/profile` - Update profile
- `PATCH /api/v1/users/:id/settings` - Update settings
- `PUT /api/v1/users/:id/password` - Change password
- `DELETE /api/v1/users/:id` - Delete user

### Me (Current User)

- `GET /api/v1/me` - Get current user
- `PATCH /api/v1/me/profile` - Update own profile
- `PATCH /api/v1/me/settings` - Update own settings

### Health

- `GET /health` - Overall health
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe

## Environment Variables

| Variable                         | Description                         | Default                 |
| -------------------------------- | ----------------------------------- | ----------------------- |
| `NODE_ENV`                       | Environment                         | `development`           |
| `PORT`                           | Server port                         | `3001`                  |
| `DATABASE_URL`                   | PostgreSQL connection URL           | -                       |
| `REDIS_URL`                      | Redis connection URL                | -                       |
| `ACCESS_TOKEN_SECRET`            | JWT access token secret             | -                       |
| `REFRESH_TOKEN_SECRET`           | JWT refresh token secret            | -                       |
| `BCRYPT_ROUNDS`                  | Password hashing rounds             | `12`                    |
| `SESSION_SERVICE_URL`            | Session service base URL            | `http://localhost:3003` |
| `INTEGRATION_REQUEST_TIMEOUT_MS` | Integration timeout in milliseconds | `5000`                  |

See `.env.example` for all variables.

## Development

```bash
# Run tests
pnpm test

# Run linter
pnpm lint

# Generate Prisma client
pnpm prisma generate

# Open Prisma Studio
pnpm db:studio
```

## Architecture

```
src/
├── api/
│   └── rest/           # Fastify routes
├── config/             # Configuration
├── domain/
│   ├── shared/         # Shared domain types
│   └── user-service/   # User domain
│       ├── errors/     # Domain errors
│       └── value-objects/
├── events/             # Event definitions
├── infrastructure/
│   ├── cache/          # Redis event publisher
│   ├── database/       # Prisma repository
│   └── external-apis/  # JWT token service
├── middleware/         # Fastify middleware
├── types/              # TypeScript types
└── index.ts            # Entry point
```

## License

Proprietary - See LICENSE
