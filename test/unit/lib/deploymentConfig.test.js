const DeploymentConfig = require('../../../lib/deploymentConfig')

const defaultConfig = {
  configvalidators: {},
  overridevalidators: {},
  restrictedRepos: ['admin', '.github', 'safe-settings']
}

const context = { log: { info: jest.fn() } }

describe('no deploymentConfig', () => {
  const deploymentConfig = new DeploymentConfig(context, 'nonexistent.yml')

  test('matches default config', () => {
    expect(deploymentConfig).toMatchObject(defaultConfig)
  })

  test('outputs info message', () => {
    expect(context.log.info).toHaveBeenCalledWith('No deployment settings found at nonexistent.yml')
  })
})

describe('sample deploymentConfig', () => {
  const deploymentConfig = new DeploymentConfig(context, './docs/sample-settings/sample-deployment-settings.yml')

  test('matches snapshot', () => {
    expect(deploymentConfig).toMatchInlineSnapshot(`
DeploymentConfig {
  "configvalidators": {
    "collaborators": {
      "error": "\`Admin cannot be assigned to collaborators\`
",
      "isValid": [Function],
    },
  },
  "overridevalidators": {
    "branches": {
      "canOverride": [Function],
      "error": "\`Branch protection required_approving_review_count cannot be overidden to a lower value\`
",
    },
    "labels": {
      "canOverride": [Function],
      "error": "Some error
",
    },
  },
  "restrictedRepos": {
    "exclude": [
      "^admin$",
      "^\\.github$",
      "^safe-settings$",
      ".*-test",
    ],
    "include": [
      "^test$",
    ],
  },
}
`)
  })
})
