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
      // character" line can render as a handful of visible words.
      //
      // 'never' rather than 'preserve': preserve only stops prettier adding
      // wraps, so a changeset written with hard-wrapped prose still carries
      // those breaks into the changelog. 'never' unwraps each paragraph onto
      // one line, which also makes `style-lint` fail on a wrapped changeset
      // instead of letting it reach a release.
      files: ['CHANGELOG.md', '.changeset/*.md'],
      options: { proseWrap: 'never' }
    }
  ]
};
