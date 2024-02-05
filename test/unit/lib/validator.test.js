/* eslint-disable no-undef */
const MergeDeep = require('../../../lib/mergeDeep')
const YAML = require('js-yaml')
const log = require('pino')('test.log')

describe('Validator Tests', () => {
  it('Branch override validator test', () => {
    const overrideMock = jest.fn((baseconfig, overrideconfig) => {
      if (baseconfig.protection.required_pull_request_reviews.required_approving_review_count && overrideconfig.protection.required_pull_request_reviews.required_approving_review_count) {
        return overrideconfig.protection.required_pull_request_reviews.required_approving_review_count >= baseconfig.protection.required_pull_request_reviews.required_approving_review_count
      }
      return true

      // console.log(`Branch override validator, baseconfig ${baseconfig} overrideconfig ${overrideconfig}`)
      // return false
    })

    const configMock = jest.fn((baseconfig) => {
      console.log(`Branch config validator, baseconfig ${baseconfig}`)
      return false
    })
    const overrideValidators = { branches: { canOverride: overrideMock, error: 'Branch overrideValidators.error' } }
    const configValidators = { branches: { isValid: configMock, error: 'Branch configValidators.error' } }

    const overrideconfig = YAML.load(`
          branches:
            - name: master
              protection:
                required_pull_request_reviews:
                  required_approving_review_count: 1
                  dismiss_stale_reviews: false
                  require_code_owner_reviews: true
                  dismissal_restrictions: {}
                required_status_checks:
                  strict: true
                  contexts: []
                enforce_admins: false
        `)

    const baseconfig = YAML.load(`
          branches:
            - name: master
              protection:
                required_pull_request_reviews:
                  required_approving_review_count: 2
                  dismiss_stale_reviews: false
                  require_code_owner_reviews: true
                  dismissal_restrictions: {}
                required_status_checks:
                  strict: true
                  contexts: []
                enforce_admins: false
        `)

    try {
      const ignorableFields = []
      const mergeDeep = new MergeDeep(log, ignorableFields, configValidators, overrideValidators)
      mergeDeep.mergeDeep(baseconfig, overrideconfig)
      // const merged = mergeDeep.mergeDeep(baseconfig, overrideconfig)
      //    expect(() => mergeDeep.mergeDeep(baseconfig, overrideconfig)).toThrow('you are using the wrong JDK');
    } catch (err) {
      expect(err).toBeDefined()
      console.log(JSON.stringify(err))
      expect(err).toEqual(Error('Branch overrideValidators.error'))
    }
    expect(overrideMock.mock.calls.length).toBe(1)
  })

  it('Repository override validator test', () => {
    const overrideMock = jest.fn((baseconfig, overrideconfig) => {
      console.log(`Repo override validator, baseconfig ${baseconfig} overrideconfig ${overrideconfig}`)
      return false
    })

    const configMock = jest.fn((baseconfig) => {
      console.log(`Repo config validator, baseconfig ${baseconfig}`)
      return false
    })
    const overrideValidators = { repository: { canOverride: overrideMock, error: 'Repo overrideValidators.error' } }
    const configValidators = { repository: { isValid: configMock, error: 'Repo configValidators.error' } }

    const overrideconfig = YAML.load(`
  repository:
    name: test
    org: decyjphr-org
    force_create: false
    description: description of test repository
    homepage: https://newhome.github.io/
    topics:
    - red
    auto_init: true
    has_issues: true
    has_projects: true
    has_wiki: false
    has_downloads: true
    allow_squash_merge: true
    allow_merge_commit: false
    allow_rebase_merge: false
    default_branch: develop
        `)

    const baseconfig = YAML.load(`
  repository:
    # A short description of the repository that will show up on GitHub
    description: description of the repos

    # A comma-separated list of topics to set on the repository
    topics:
    - uber
    - newone
        `)

    try {
      const ignorableFields = []
      const mergeDeep = new MergeDeep(log, ignorableFields, configValidators, overrideValidators)
      mergeDeep.mergeDeep(baseconfig, overrideconfig)
    } catch (err) {
      expect(err).toBeDefined()
      expect(err).toEqual(Error('Repo overrideValidators.error'))
    }
    expect(overrideMock.mock.calls.length).toBe(1)
  })

  it('Repository config validator test', () => {
    const overrideMock = jest.fn((baseconfig, overrideconfig) => {
      console.log(`Repo override validator, baseconfig ${baseconfig} overrideconfig ${overrideconfig}`)
      return true
    })

    const configMock = jest.fn((baseconfig) => {
      console.log(`Repo config validator, baseconfig ${baseconfig}`)
      return false
    })
    const overrideValidators = { repository: { canOverride: overrideMock, error: 'Repo overrideValidators.error' } }
    const configValidators = { repository: { isValid: configMock, error: 'Repo configValidators.error' } }

    const overrideconfig = YAML.load(`
  repository:
    name: test
    org: decyjphr-org
    force_create: false
    description: description of test repository
    homepage: https://newhome.github.io/
    topics:
    - red
    auto_init: true
    has_issues: true
    has_projects: true
    has_wiki: false
    has_downloads: true
    allow_squash_merge: true
    allow_merge_commit: false
    allow_rebase_merge: false
    default_branch: develop
        `)

    const baseconfig = YAML.load(`
  repository:
    # A short description of the repository that will show up on GitHub
    description: description of the repos

    # A comma-separated list of topics to set on the repository
    topics:
    - uber
    - newone
        `)

    try {
      const ignorableFields = []
      const mergeDeep = new MergeDeep(log, ignorableFields, configValidators, overrideValidators)
      mergeDeep.mergeDeep(baseconfig, overrideconfig)
    } catch (err) {
      expect(err).toBeDefined()
      expect(err).toEqual(Error('Repo configValidators.error'))
    }
    expect(configMock.mock.calls.length).toBe(1)
  })
})
