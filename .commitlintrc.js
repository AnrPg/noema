// =============================================================================
// COMMITLINT CONFIGURATION
// =============================================================================
// Enforces conventional commit message format
// https://www.conventionalcommits.org/

module.exports = {
  extends: ['@commitlint/config-conventional'],
  
  // Custom rules
  rules: {
    // Type must be one of these values
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation only
        'style',    // Formatting, no code change
        'refactor', // Code change that neither fixes bug nor adds feature
        'test',     // Adding tests
        'chore',    // Maintenance tasks
        'perf',     // Performance improvement
        'ci',       // CI/CD changes
        'build',    // Build system changes
        'revert',   // Revert previous commit
      ],
    ],
    
    // Type must be lowercase
    'type-case': [2, 'always', 'lower-case'],
    
    // Type cannot be empty
    'type-empty': [2, 'never'],
    
    // Scope must be lowercase
    'scope-case': [2, 'always', 'lower-case'],
    
    // Scope values (optional but recommended)
    'scope-enum': [
      1, // Warning only
      'always',
      [
        'api',      // API package
        'mobile',   // Mobile app
        'ai',       // AI service
        'shared',   // Shared package
        'deps',     // Dependencies
        'config',   // Configuration
        'docker',   // Docker/containers
        'ci',       // CI/CD
        'db',       // Database
        'auth',     // Authentication
        'study',    // Study/flashcard features
        'gamify',   // Gamification
        'plugin',   // Plugin system
        'ui',       // User interface
        'ux',       // User experience
      ],
    ],
    
    // Subject cannot be empty
    'subject-empty': [2, 'never'],
    
    // Subject should not end with period
    'subject-full-stop': [2, 'never', '.'],
    
    // Subject should be sentence-case (lowercase start)
    'subject-case': [
      2,
      'never',
      ['sentence-case', 'start-case', 'pascal-case', 'upper-case'],
    ],
    
    // Header (type + scope + subject) max length
    'header-max-length': [2, 'always', 50],
    
    // Body max line length
    'body-max-line-length': [2, 'always', 72],
    
    // Footer max line length
    'footer-max-line-length': [2, 'always', 72],
    
    // Body must have leading blank line
    'body-leading-blank': [2, 'always'],
    
    // Footer must have leading blank line
    'footer-leading-blank': [2, 'always'],
  },
  
  // Help URL for failed commits
  helpUrl: 'https://www.conventionalcommits.org/',
  
  // Prompt configuration for commitizen
  prompt: {
    questions: {
      type: {
        description: "Select the type of change you're committing",
        enum: {
          feat: {
            description: 'A new feature',
            title: 'Features',
            emoji: '✨',
          },
          fix: {
            description: 'A bug fix',
            title: 'Bug Fixes',
            emoji: '🐛',
          },
          docs: {
            description: 'Documentation only changes',
            title: 'Documentation',
            emoji: '📝',
          },
          style: {
            description: 'Changes that do not affect the meaning of the code',
            title: 'Styles',
            emoji: '🎨',
          },
          refactor: {
            description: 'A code change that neither fixes a bug nor adds a feature',
            title: 'Code Refactoring',
            emoji: '♻️',
          },
          perf: {
            description: 'A code change that improves performance',
            title: 'Performance',
            emoji: '⚡',
          },
          test: {
            description: 'Adding missing tests or correcting existing tests',
            title: 'Tests',
            emoji: '✅',
          },
          build: {
            description: 'Changes that affect the build system or external dependencies',
            title: 'Builds',
            emoji: '🔧',
          },
          ci: {
            description: 'Changes to CI configuration files and scripts',
            title: 'CI',
            emoji: '👷',
          },
          chore: {
            description: "Other changes that don't modify src or test files",
            title: 'Chores',
            emoji: '📦',
          },
          revert: {
            description: 'Reverts a previous commit',
            title: 'Reverts',
            emoji: '⏪',
          },
        },
      },
      scope: {
        description: 'What is the scope of this change (e.g. api, mobile, ai)',
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
        description: 'A BREAKING CHANGE commit requires a body. Please enter a longer description of the commit itself',
      },
      breaking: {
        description: 'Describe the breaking changes',
      },
      isIssueAffected: {
        description: 'Does this change affect any open issues?',
      },
      issuesBody: {
        description: 'If issues are closed, the commit requires a body. Please enter a longer description of the commit itself',
      },
      issues: {
        description: 'Add issue references (e.g. "Fixes #123", "Closes #456")',
      },
    },
  },
};
