import type { Config } from 'tailwindcss';
import preset from '@examready/tailwind-config/preset';

export default {
  presets: [preset],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
} satisfies Config;
