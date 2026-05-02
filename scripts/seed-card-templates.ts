import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PrismaClient,
  CardType,
  DifficultyLevel,
  TemplateVisibility,
} from '../services/content-service/generated/prisma/index.js';

const ADMIN_USER_ID = 'user_noemaBootstrapAdmin0001';

type SeedTemplate = {
  id: string;
  name: string;
  description: string;
  cardType: CardType;
  difficulty: DifficultyLevel;
  tags: string[];
  content: {
    front: string;
    back: string;
    hint?: string;
    explanation?: string;
  };
  metadata: Record<string, unknown>;
};

const templates: SeedTemplate[] = [
  {
    id: 'template_admin_atomic_starter',
    name: 'Atomic Recall Starter',
    description: 'Single-fact prompt/answer template for straightforward retrieval practice.',
    cardType: CardType.ATOMIC,
    difficulty: DifficultyLevel.BEGINNER,
    tags: ['starter', 'atomic', 'recall'],
    content: {
      front: 'What is {{term}}?',
      back: '{{definition}}',
      hint: 'Keep the answer to one precise idea.',
      explanation:
        'Use this for facts, definitions, formulas, or terminology that should be recalled with minimal ambiguity.',
    },
    metadata: {
      templateCategory: 'foundational',
      recommendedModes: ['knowledge_gaining', 'language_learning'],
      suggestedFields: ['term', 'definition'],
    },
  },
  {
    id: 'template_admin_cloze_explainer',
    name: 'Cloze Explanation Builder',
    description: 'Fill-in-the-gap template for short passages, rules, or canonical phrasing.',
    cardType: CardType.CLOZE,
    difficulty: DifficultyLevel.INTERMEDIATE,
    tags: ['cloze', 'reading', 'retention'],
    content: {
      front: 'Complete the missing part: {{statement_with_gap}}',
      back: '{{missing_phrase}}',
      hint: 'Focus on the exact wording or symbol sequence.',
      explanation:
        'Useful when learners should reconstruct a definition, law, grammatical pattern, or theorem statement from context.',
    },
    metadata: {
      templateCategory: 'contextual-recall',
      recommendedModes: ['knowledge_gaining', 'language_learning'],
      suggestedFields: ['statement_with_gap', 'missing_phrase'],
    },
  },
  {
    id: 'template_admin_comparison_matrix',
    name: 'Comparison Matrix',
    description: 'Two-sided template for distinguishing similar concepts, tools, or categories.',
    cardType: CardType.COMPARISON,
    difficulty: DifficultyLevel.INTERMEDIATE,
    tags: ['comparison', 'discrimination', 'concepts'],
    content: {
      front: 'Compare {{concept_a}} and {{concept_b}}. What is the key difference?',
      back: '{{difference_summary}}',
      hint: 'Contrast purpose, structure, or conditions of use.',
      explanation:
        'Best for ideas learners often collapse together, such as similar APIs, neighboring concepts, or related linguistic forms.',
    },
    metadata: {
      templateCategory: 'discrimination',
      recommendedModes: ['knowledge_gaining'],
      suggestedFields: ['concept_a', 'concept_b', 'difference_summary'],
    },
  },
  {
    id: 'template_admin_process_walkthrough',
    name: 'Process Walkthrough',
    description: 'Step-based template for workflows, procedures, and transformations.',
    cardType: CardType.PROCESS,
    difficulty: DifficultyLevel.ADVANCED,
    tags: ['process', 'workflow', 'sequencing'],
    content: {
      front: 'How does {{process_name}} proceed from start to finish?',
      back: '1. {{step_1}}\n2. {{step_2}}\n3. {{step_3}}\n4. {{step_4}}',
      hint: 'Name the steps in order and include the transition logic.',
      explanation:
        'Use this when order matters: algorithms, biological processes, grammar transformations, or operational runbooks.',
    },
    metadata: {
      templateCategory: 'procedural',
      recommendedModes: ['knowledge_gaining'],
      suggestedFields: ['process_name', 'step_1', 'step_2', 'step_3', 'step_4'],
    },
  },
  {
    id: 'template_admin_multiple_choice',
    name: 'Multiple Choice Distractor Set',
    description: 'Question template with one intended answer and plausible distractors.',
    cardType: CardType.MULTIPLE_CHOICE,
    difficulty: DifficultyLevel.INTERMEDIATE,
    tags: ['multiple-choice', 'assessment', 'distractors'],
    content: {
      front: '{{question}}\n\nA. {{option_a}}\nB. {{option_b}}\nC. {{option_c}}\nD. {{option_d}}',
      back: 'Correct answer: {{correct_option}}',
      hint: 'Distractors should be plausible, not silly.',
      explanation:
        'Use this when you want recognition plus discrimination, especially for admin-curated checks or onboarding content.',
    },
    metadata: {
      templateCategory: 'assessment',
      recommendedModes: ['knowledge_gaining', 'language_learning'],
      suggestedFields: [
        'question',
        'option_a',
        'option_b',
        'option_c',
        'option_d',
        'correct_option',
      ],
    },
  },
  {
    id: 'template_admin_minimal_pair',
    name: 'Minimal Pair Drill',
    description: 'Language-learning template for distinguishing easily confusable forms or sounds.',
    cardType: CardType.MINIMAL_PAIR,
    difficulty: DifficultyLevel.ELEMENTARY,
    tags: ['language-learning', 'minimal-pair', 'pronunciation'],
    content: {
      front:
        'Distinguish {{item_a}} from {{item_b}}. Which one matches: {{target_meaning_or_sound}}?',
      back: '{{correct_item}}',
      hint: 'Pay attention to the smallest meaningful contrast.',
      explanation:
        'This is especially useful for pronunciation, orthography, and commonly confused vocabulary pairs.',
    },
    metadata: {
      templateCategory: 'language-discrimination',
      recommendedModes: ['language_learning'],
      suggestedFields: ['item_a', 'item_b', 'target_meaning_or_sound', 'correct_item'],
    },
  },
];

function loadRootEnvFile(): void {
  const scriptDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)));
  const envPath = resolve(scriptDirectory, '..', '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/u);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (key === '' || process.env[key] !== undefined) {
      continue;
    }

    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^"(.*)"$/u, '$1')
      .replace(/^'(.*)'$/u, '$1');
    process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadRootEnvFile();

  const databaseUrl = process.env['DATABASE_URL_CONTENT'] ?? process.env['DATABASE_URL'];
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('Missing DATABASE_URL_CONTENT or DATABASE_URL for content-service seeding.');
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    for (const template of templates) {
      await prisma.template.upsert({
        where: { id: template.id },
        update: {
          name: template.name,
          description: template.description,
          cardType: template.cardType,
          content: template.content,
          difficulty: template.difficulty,
          tags: template.tags,
          metadata: template.metadata,
          visibility: TemplateVisibility.PRIVATE,
          updatedBy: ADMIN_USER_ID,
        },
        create: {
          id: template.id,
          userId: ADMIN_USER_ID,
          name: template.name,
          description: template.description,
          cardType: template.cardType,
          content: template.content,
          difficulty: template.difficulty,
          knowledgeNodeIds: [],
          tags: template.tags,
          metadata: template.metadata,
          visibility: TemplateVisibility.PRIVATE,
          createdBy: ADMIN_USER_ID,
          updatedBy: ADMIN_USER_ID,
        },
      });
    }

    const count = await prisma.template.count({
      where: {
        userId: ADMIN_USER_ID,
        deletedAt: null,
      },
    });

    console.log(
      JSON.stringify(
        {
          seededTemplates: templates.map((template) => ({
            id: template.id,
            name: template.name,
            cardType: template.cardType,
          })),
          totalTemplatesForAdmin: count,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
