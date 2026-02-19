import baseConfig from '@noema/ui/tailwind.config';
import type { Config } from 'tailwindcss';

const config: Config = {
  presets: [baseConfig],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
};

export default config;
