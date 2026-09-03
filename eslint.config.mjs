import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';

// The rules the community-plugin review runs on every release (it delists on
// failure within 24h). Only the `obsidianmd/*` rules here — the rest of that
// preset is typescript-eslint's type-checked set, which this config already
// covers in its own way.
const obsidianRules = Object.fromEntries(
  (Array.isArray(obsidianmd.configs.recommended) ? obsidianmd.configs.recommended : [obsidianmd.configs.recommended])
    .flatMap((c) => Object.entries(c.rules ?? {}))
    // …plus the one core rule the preset configures for Obsidian: fetch → requestUrl.
    .filter(([name]) => name.startsWith('obsidianmd/') || name === 'no-restricted-globals'),
);
// Product and vendor names the sentence-case rule would otherwise lowercase.
const BRANDS = ['Myu', 'askMyu', 'AskMyu', 'LinkedIn', 'Gmail', 'Google', 'Microsoft', 'Outlook', 'Slack', 'Zulip', 'Fastmail', 'Obsidian', 'Bases', 'Tasks', 'Fireflies', 'Zoom', 'CalDAV', 'Today', 'Google Calendar', 'Microsoft Outlook', 'Google Drive', 'Google Doc'];
const ACRONYMS = ['IMAP', 'HTTPS', 'HTTP', 'URL', 'SSE', 'API', 'CRM', 'PDF'];
// URLs and vault paths are not sentences.
const NOT_SENTENCES = ['^https?://', 'Myu/[A-Za-z]+'];

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'main.js', '*.config.mjs'] },
  {
    files: ['src/**/*.ts'],
    plugins: { obsidianmd },
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      ...obsidianRules,
      'obsidianmd/ui/sentence-case': ['error', { brands: BRANDS, acronyms: ACRONYMS, ignoreRegex: NOT_SENTENCES, allowAutoFix: true }],
      // The type-aware rules the directory's automated review reports as
      // warnings on every release (0.1.0, 2026-09-03: ~50 of them were ours
      // once its environment noise was set aside). Errors here, so they never
      // reach a scan again. NEVER `eslint-disable` an obsidianmd rule — the
      // review counts that as a blocking Risk.
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'error',
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      // QA invariant 4 lives in a lint rule, not a convention: `Notice` is for
      // errors and status only. Initiative paths import it over my dead body.
      // The shared-package boundary (HANDOFF_OBSIDIAN.md, locked): types may
      // cross, runtime code may not. `allowTypeImports` is the whole rule —
      // type imports vanish at compile time, so the public bundle can never
      // carry shared logic. `src/wire/` is the only place that imports it at all.
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [{
          name: '@askmyu/shared',
          message: 'Import shared TYPES through src/wire, and never shared runtime code — the mirror ships a public bundle.',
          allowTypeImports: true,
        }],
        patterns: [{
          group: ['@askmyu/shared/*'],
          message: 'Import shared TYPES through src/wire, and never shared runtime code — the mirror ships a public bundle.',
          allowTypeImports: true,
        }],
      }],
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'obsidian',
          importNames: ['Notice'],
          message:
            'Notice is banned outside notify.ts. Route user-visible messages through src/notify.ts, which exists so the ban is greppable (QA invariant 4: no initiative toasts).',
        }],
      }],
    },
  },
  {
    // The one module allowed to import it — see the file header for why.
    files: ['src/notify.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
