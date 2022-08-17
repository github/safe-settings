/* eslint-disable no-undef */
const MergeDeep = require('../../../lib/mergeDeep')
const YAML = require('js-yaml')
const log = require('pino')('test.log')

describe('Validator Tests', () => {

  it('Branch override validator test', () => {
    const overrideMock = jest.fn((baseconfig, overrideconfig) => {
      console.log(`Branch override validator, baseconfig ${baseconfig} overrideconfig ${overrideconfig}`)
      return false
    })
  
    const configMock = jest.fn((baseconfig) => {
      console.log(`Branch config validator, baseconfig ${baseconfig}`)
      return false
    })
    const overrideValidators = { branches: { canOverride: overrideMock, error: 'Branch overrideValidators.error' } }
    const configValidators = { branches: { isValid: configMock, error: 'Branch configValidators.error' }}

    const source = YAML.load(`
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

    const target = YAML.load(`
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
      const merged = mergeDeep.mergeDeep(target, source)
//    expect(() => mergeDeep.mergeDeep(target, source)).toThrow('you are using the wrong JDK');
    } catch (err) {
      expect(err).toBeDefined
      expect(err).toEqual(Error('Branch overrideValidators.error'))
    }
    expect(overrideMock.mock.calls.length).toBe(1);
   
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
    const configValidators = { repository: { isValid: configMock, error: 'Repo configValidators.error' }}

    const source = YAML.load(`
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

    const target = YAML.load(`
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
      const merged = mergeDeep.mergeDeep(target, source)
    } catch (err) {
      expect(err).toBeDefined
      expect(err).toEqual(Error('Repo overrideValidators.error'))
    }
    expect(overrideMock.mock.calls.length).toBe(1);
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
    const configValidators = { repository: { isValid: configMock, error: 'Repo configValidators.error' }}

    const source = YAML.load(`
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

    const target = YAML.load(`
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
      const merged = mergeDeep.mergeDeep(target, source)
    } catch (err) {
      expect(err).toBeDefined
      expect(err).toEqual(Error('Repo configValidators.error'))
    }
    expect(configMock.mock.calls.length).toBe(1);
  })
})
