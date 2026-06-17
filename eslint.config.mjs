import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**'],
  },
  // Main process, preload, and shared types — Node environment
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/shared/**/*.ts'],
    extends: tseslint.configs.recommendedTypeChecked,
    languageOptions: {
      parserOptions: {
        project: './tsconfig.node.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Renderer — browser + React environment
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    extends: tseslint.configs.recommendedTypeChecked,
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
    languageOptions: {
      parserOptions: {
        project: './tsconfig.web.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
)
