import globals from 'globals'

// The engine (src/engine) is plain JavaScript that must never touch the page: this catches stray DOM helpers
// ($, toast, icon, render*) left over from the old single-file page, and assignments to imported bindings.
export default [
  {
    files: ['src/engine/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
    },
    rules: {
      'no-undef': 'error',
      'no-restricted-globals': ['error', { name: 'document', message: 'The engine must not touch the page; emit an event or return data instead.' }],
      'no-import-assign': 'error',
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-redeclare': 'error',
    },
  },
]
