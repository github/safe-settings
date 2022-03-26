/* eslint-disable no-undef */
const MergeDeep = require('../../../lib/mergeDeep')
const YAML = require('js-yaml')
const log = require('pino')('test.log')

describe('mergeDeep', () => {
  it('works in a realistic scenario', () => {
    const target = YAML.load(`
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

    const source = YAML.load(`
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

    const expected = {
      additions: [
        undefined
      ],
      modifications: [
        {
          protection: {
            required_pull_request_reviews: {
              required_approving_review_count: 2
            }
          }
        }
      ]
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target.branches, source.branches)
    console.log(`${JSON.stringify(merged)}`)
    expect(merged).toEqual(expected)
  })

  it('from the api', () => {
    const protection = {
      url: 'https://api.github.com/repos/decyjphr-org/test/branches/develop/protection',
      required_status_checks: {
        url: 'https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/required_status_checks',
        strict: true,
        contexts: [],
        contexts_url: 'https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/required_status_checks/contexts',
        checks: []
      },
      restrictions: {
        url: 'https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/restrictions',
        users_url: 'https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/restrictions/users',
        teams_url: 'https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/restrictions/teams',
        apps_url: 'https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/restrictions/apps',
        users: [],
        teams: [],
        apps: []
      },
      required_pull_request_reviews: {
        url: 'https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/required_pull_request_reviews',
        dismiss_stale_reviews: true,
        require_code_owner_reviews: true,
        required_approving_review_count: 2,
        dismissal_restrictions: {
          url: 'https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/dismissal_restrictions',
          users_url: 'https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/dismissal_restrictions/users',
          teams_url: 'https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/dismissal_restrictions/teams',
          users: [],
          teams: []
        }
      },
      required_signatures: {
        url: 'https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/required_signatures',
        enabled: false
      },
      enforce_admins: {
        url: 'https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/enforce_admins',
        enabled: false
      },
      required_linear_history: {
        enabled: false
      },
      allow_force_pushes: {
        enabled: false
      },
      allow_deletions: {
        enabled: false
      },
      required_conversation_resolution: {
        enabled: false
      }
    }

    // Re-format the enabled protection attributes
    protection.required_conversation_resolution = protection.required_conversation_resolution.enabled
    protection.allow_deletions = protection.allow_deletions.enabled
    protection.required_linear_history = protection.required_linear_history.enabled
    protection.enforce_admins = protection.enforce_admins.enabled
    protection.required_signatures = protection.required_signatures.enabled

    const target = {
      branches: [
        {
          name: 'master',
          protection: protection
        }
      ]
    }

    const source = YAML.load(`
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

    const expected = {
      additions: [
        undefined
      ],
      modifications: [
        {
          protection: {
            required_pull_request_reviews: {
              dismiss_stale_reviews: false
            }
          }
        }
      ]
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target.branches, source.branches)
    console.log(`${JSON.stringify(merged)}`)
    expect(merged).toEqual(expected)
  })
})
