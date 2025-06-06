/** @type {import('semantic-release').GlobalConfig} */
const semanticReleaseConfig = {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [{ type: 'chore', scope: 'deps', release: 'patch' }]
      }
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: {
          types: [
            { type: 'feat', section: '✨ Features' },
            { type: 'fix', section: '🐛 Bug Fixes' },
            { type: 'docs', section: '📚 Documentation' },
            { type: 'test', section: '🧪 Tests' },
            { type: 'perf', section: '⚡️ Performance Improvements' },
            { type: 'refactor', section: '♻️ Code Refactoring' },
            { type: 'style', section: '💄 Style' },
            { type: 'chore', section: '🔧 Maintenance' },
            { type: 'build', section: '📦 Build System' },
            { type: 'ci', section: '👷 Continuous Integration' },
            { type: 'revert', section: '⏪ Reverts' }
          ]
        }
      }
    ],
    '@semantic-release/npm',
    '@semantic-release/github'
  ]
};

export default semanticReleaseConfig;
