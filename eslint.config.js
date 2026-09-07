import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // 產物與相依套件不屬於本專案維護範圍，排除後才能讓檢查只回報可修正的原始碼問題。
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2020, parser: tseslint.parser, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // TypeScript 編譯器已理解型別用法與 Bun 全域物件；交給它判斷可避免 ESLint 將合法型別誤報成未使用。
      'no-undef': 'off',
      'no-unused-vars': 'off',
      // Hooks 的呼叫順序與依賴項會直接影響照護資料是否讀錯，保留這兩項核心規則。
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
)
