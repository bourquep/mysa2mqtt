import pluginJs from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import tsdoc from 'eslint-plugin-tsdoc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ['**/*.{js,mjs,cjs,ts}'] },
  { languageOptions: { globals: globals.node } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  jsdoc.configs['flat/recommended-typescript'],
  {
    plugins: { jsdoc },
    rules: {
      'jsdoc/tag-lines': 'off',
      'jsdoc/check-tag-names': 'off',
      'jsdoc/valid-types': 'off'
    }
  },
  { plugins: { tsdoc }, rules: { 'tsdoc/syntax': 'warn' } }
];
