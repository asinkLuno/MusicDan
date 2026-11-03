import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'src-tauri/**',
      'plugins/**',
      'android-signing/**',
      'artifacts/**',
      'docs/**',
      'public/**',
      'tests/fixtures/**',
      'website/public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    rules: {
      // 冗余代码检查：未使用的变量、参数与导入
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all' },
      ],
      // Tamagui 主题扩展依赖模块合并（module augmentation），必须保留空 interface
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
    },
  },
);
