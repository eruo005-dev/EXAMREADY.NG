/**
 * ESLint config for Next.js apps. Extends the base config with React + Next rules.
 */
module.exports = {
  extends: ['./base.js', 'next/core-web-vitals'],
  plugins: ['react', 'react-hooks'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    '@next/next/no-html-link-for-pages': 'off',
  },
};
