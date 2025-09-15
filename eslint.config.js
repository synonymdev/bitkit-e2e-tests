// eslint.config.js (ESM, ESLint v9)
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  // Ignore junk
  { ignores: ['node_modules/', 'dist/', 'build/', '.git/', '.cache/'] },

  // Base JS rules
  js.configs.recommended,

  // TypeScript rules (no type-checking)
  // If you want type-aware rules, switch to `recommendedTypeChecked` and add parserOptions below.
  ...tseslint.configs.recommended,

  // Project-specific tweaks
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      // For type-aware rules, uncomment and configure:
      // parserOptions: {
      //   projectService: true, // uses your tsconfig.json
      //   tsconfigRootDir: import.meta.dirname,
      // },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
