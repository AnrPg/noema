// =============================================================================
// Commitlint Configuration for Noema
// =============================================================================
// Enforces Conventional Commits specification
// https://www.conventionalcommits.org/
// =============================================================================

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],

  // Custom rules
  rules: {
    // Type must be one of the following
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation only
        'style', // Code style (formatting, semicolons, etc)
        'refactor', // Code refactoring
        'perf', // Performance improvement
        'test', // Adding/updating tests
        'build', // Build system or dependencies
        'ci', // CI/CD configuration
        'chore', // Other changes (maintenance)
        'revert', // Revert previous commit
      ],
    ],

    // Type must be lowercase
    'type-case': [2, 'always', 'lower-case'],

    // Type cannot be empty
    'type-empty': [2, 'never'],

    // Subject cannot be empty
    'subject-empty': [2, 'never'],

    // Subject must start with lowercase (disabled - allow uppercase)
    'subject-case': [0],

    // Subject must not end with period
    'subject-full-stop': [2, 'never', '.'],

    // Header max length
    'header-max-length': [2, 'always', 100],

    // Body max line length
    'body-max-line-length': [1, 'always', 200],

    // Footer max line length
    'footer-max-line-length': [1, 'always', 200],

    // Scope (optional) - service or package names
    'scope-enum': [
      1,
      'always',
      [
        // Packages
        'config',
        'contracts',
        'events',
        'types',
        'utils',
        'validation',

        // Services
        'user-service',
        'content-service',
        'scheduler-service',
        'session-service',
        'gamification-service',
        'knowledge-graph-service',
        'metacognition-service',
        'strategy-service',
        'ingestion-service',
        'analytics-service',
        'sync-service',
        'vector-service',
        'notification-service',
        'media-service',
        'collaboration-service',

        // Agents
        'learning-agent',
        'diagnostic-agent',
        'strategy-agent',
        'content-generation-agent',
        'ingestion-agent',
        'knowledge-graph-agent',
        'socratic-tutor-agent',
        'calibration-agent',
        'governance-agent',
        'taxonomy-curator-agent',

        // Apps
        'mobile',
        'web-admin',

        // Infrastructure
        'docker',
        'k8s',
        'terraform',
        'ci',
        'deps',
        'release',
      ],
    ],
    'scope-case': [2, 'always', 'kebab-case'],
  },

  // Ignore dependabot and release-please commits
  ignores: [
    (message) => message.startsWith('chore(deps)'),
    (message) => message.startsWith('chore(release)'),
    (message) => /^Merge/.test(message),
  ],

  // Custom prompt configuration
  prompt: {
    settings: {},
    messages: {
      skip: ':skip',
      max: 'upper %d chars',
      min: '%d chars at least',
      emptyWarning: 'can not be empty',
      upperLimitWarning: 'over limit',
      lowerLimitWarning: 'below limit',
    },
    questions: {
      type: {
        description: "Select the type of change you're committing",
        enum: {
          feat: {
            description: 'A new feature',
            title: 'Features',
          },
          fix: {
            description: 'A bug fix',
            title: 'Bug Fixes',
          },
          docs: {
            description: 'Documentation only changes',
            title: 'Documentation',
          },
          style: {
            description: 'Changes that do not affect the meaning of the code',
            title: 'Styles',
          },
          refactor: {
            description: 'A code change that neither fixes a bug nor adds a feature',
            title: 'Code Refactoring',
          },
          perf: {
            description: 'A code change that improves performance',
            title: 'Performance Improvements',
          },
          test: {
            description: 'Adding missing tests or correcting existing tests',
            title: 'Tests',
          },
          build: {
            description: 'Changes that affect the build system or external dependencies',
            title: 'Builds',
          },
          ci: {
            description: 'Changes to CI configuration files and scripts',
            title: 'Continuous Integration',
          },
          chore: {
            description: "Other changes that don't modify src or test files",
            title: 'Chores',
          },
          revert: {
            description: 'Reverts a previous commit',
            title: 'Reverts',
          },
        },
      },
      scope: {
        description: 'What is the scope of this change (e.g. service-name, package-name)',
      },
      subject: {
        description: 'Write a short, imperative tense description of the change',
      },
      body: {
        description: 'Provide a longer description of the change',
      },
      isBreaking: {
        description: 'Are there any breaking changes?',
      },
      breakingBody: {
        description: 'A BREAKING CHANGE commit requires a body. Please enter a longer description',
      },
      breaking: {
        description: 'Describe the breaking changes',
      },
      isIssueAffected: {
        description: 'Does this change affect any open issues?',
      },
      issuesBody: {
        description:
          'If issues are closed, the commit requires a body. Please enter a longer description',
      },
      issues: {
        description: 'Add issue references (e.g. "fix #123", "re #123")',
      },
    },
  },
};
