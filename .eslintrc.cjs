module.exports = {
  plugins: ["@typescript-eslint", "eslint-plugin-tsdoc"],
  extends: ["plugin:@typescript-eslint/recommended"],
  parser: "@typescript-eslint/parser",
  root: true,
  rules: {
    '@typescript-eslint/no-unused-vars': ["error", { "argsIgnorePattern": "^_" }],
    'tsdoc/syntax': 'warn'
  }
};
