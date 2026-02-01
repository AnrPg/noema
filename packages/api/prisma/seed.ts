// =============================================================================
// DATABASE SEED
// =============================================================================
// Seeds the database with initial data for development

import { PrismaClient } from '@prisma/client';
import { ACHIEVEMENTS, DEFAULT_SKILL_TREES, META_LEARNING_UNLOCKS } from '@manthanein/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');
  
  // Create default plugins
  const plugins = [
    {
      name: 'Markdown Importer',
      slug: 'markdown-importer',
      version: '1.0.0',
      author: 'Manthanein',
      description: 'Import flashcards from Markdown files with frontmatter',
      category: 'importer',
      isOfficial: true,
      isVerified: true,
      permissions: ['storage:read', 'cards:create'],
      manifestUrl: 'https://plugins.manthanein.com/markdown-importer/manifest.json',
      bundleUrl: 'https://plugins.manthanein.com/markdown-importer/bundle.js',
    },
    {
      name: 'Anki Importer',
      slug: 'anki-importer',
      version: '1.0.0',
      author: 'Manthanein',
      description: 'Import decks from Anki (.apkg) files',
      category: 'importer',
      isOfficial: true,
      isVerified: true,
      permissions: ['storage:read', 'cards:create', 'decks:create'],
      manifestUrl: 'https://plugins.manthanein.com/anki-importer/manifest.json',
      bundleUrl: 'https://plugins.manthanein.com/anki-importer/bundle.js',
    },
    {
      name: 'AI Card Generator',
      slug: 'ai-card-generator',
      version: '1.0.0',
      author: 'Manthanein',
      description: 'Generate flashcards from text using AI',
      category: 'card_generation',
      isOfficial: true,
      isVerified: true,
      permissions: ['cards:create', 'ai:generate'],
      manifestUrl: 'https://plugins.manthanein.com/ai-card-generator/manifest.json',
      bundleUrl: 'https://plugins.manthanein.com/ai-card-generator/bundle.js',
    },
    {
      name: 'Medical Terminology',
      slug: 'medical-terminology',
      version: '1.0.0',
      author: 'Manthanein',
      description: 'Specialized card types and study modes for medical vocabulary',
      category: 'domain_specific',
      isOfficial: true,
      isVerified: true,
      permissions: ['cards:read'],
      manifestUrl: 'https://plugins.manthanein.com/medical-terminology/manifest.json',
      bundleUrl: 'https://plugins.manthanein.com/medical-terminology/bundle.js',
    },
    {
      name: 'Code Syntax Highlighter',
      slug: 'code-syntax-highlighter',
      version: '1.0.0',
      author: 'Manthanein',
      description: 'Syntax highlighting for code snippets in cards',
      category: 'visualization',
      isOfficial: true,
      isVerified: true,
      permissions: [],
      manifestUrl: 'https://plugins.manthanein.com/code-syntax-highlighter/manifest.json',
      bundleUrl: 'https://plugins.manthanein.com/code-syntax-highlighter/bundle.js',
    },
    {
      name: 'Latex Math Renderer',
      slug: 'latex-math-renderer',
      version: '1.0.0',
      author: 'Manthanein',
      description: 'Render LaTeX mathematical equations in cards',
      category: 'visualization',
      isOfficial: true,
      isVerified: true,
      permissions: [],
      manifestUrl: 'https://plugins.manthanein.com/latex-math-renderer/manifest.json',
      bundleUrl: 'https://plugins.manthanein.com/latex-math-renderer/bundle.js',
    },
  ];
  
  for (const plugin of plugins) {
    await prisma.plugin.upsert({
      where: { slug: plugin.slug },
      update: {},
      create: plugin,
    });
  }
  
  console.log(`✅ Created ${plugins.length} default plugins`);
  
  // Log achievement definitions (these are stored in code, not DB)
  console.log(`📊 ${ACHIEVEMENTS.length} achievements defined in code`);
  console.log(`🌳 ${DEFAULT_SKILL_TREES.length} skill trees defined in code`);
  console.log(`🔓 ${META_LEARNING_UNLOCKS.length} meta-learning unlocks defined in code`);
  
  console.log('✅ Database seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
