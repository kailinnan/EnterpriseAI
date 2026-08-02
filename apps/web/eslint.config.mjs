import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['.next/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser, ...globals.node }, parserOptions: { project: './tsconfig.json' } }, rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], 'no-undef': 'off' } },
);
