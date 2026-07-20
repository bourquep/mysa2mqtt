module.exports = {
  tabWidth: 2,
  useTabs: false,
  printWidth: 120,
  proseWrap: 'always',
  singleQuote: true,
  trailingComma: 'none',
  arrowParens: 'always',
  tsdoc: true,
  plugins: ['prettier-plugin-organize-imports', 'prettier-plugin-jsdoc'],
  overrides: [
    {
      // Changesets copies these into GitHub Release bodies, which render with
      // GFM hard line breaks -- every source newline becomes a <br>. Wrapping
      // at printWidth counts markdown link *source* (mostly URL), so a "120
      // character" line can render as a handful of visible words. Leave these
      // unwrapped and let GitHub reflow them.
      files: ['CHANGELOG.md', '.changeset/*.md'],
      options: { proseWrap: 'preserve' }
    }
  ]
};
