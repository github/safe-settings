/* eslint-disable no-undef */
const MergeDeep = require('../../../lib/mergeDeep')
const YAML = require('js-yaml')
const log = require('pino')('test.log')

describe('MergeDeep Tests', () => {

  it('CompareDeep basic test Works', () => {
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
      additions: {},
      modifications: {
        branches: [
        {
          protection: {
            required_pull_request_reviews: {
              required_approving_review_count: 2
            }
          }
        }
      ]
      }, 
      hasChanges: true
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    console.log(`${JSON.stringify(merged)}`)
    console.log(`${JSON.stringify(expected)}`)
    expect(merged).toEqual(expected)
  })


  it('CompareDeep Undefined target Works', () => {
    const source = YAML.load(`
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
      additions: 
        {
          protection: {
            required_pull_request_reviews: {
              required_approving_review_count: 2,
              dismiss_stale_reviews: false,
              require_code_owner_reviews: true,
              dismissal_restrictions: {}
            },
            required_status_checks: {
              strict: true,
              contexts: []
            },
            enforce_admins: false
            }
          }
        ,
        modifications: {},
        hasChanges: true
      }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(undefined, source)
    console.log(`${JSON.stringify(merged)}`)
    expect(merged).toEqual(expected)
  })

  it('CompareDeep Empty target Works', () => {
    const source = YAML.load(`
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
      additions:
        {
          protection:{
            required_pull_request_reviews:{
              required_approving_review_count:2,
              dismiss_stale_reviews:false,
              require_code_owner_reviews:true,
              dismissal_restrictions:{}},
              required_status_checks:{
                strict:true,
                contexts:[]
              },
              enforce_admins:false
            }
          }
        ,
        modifications:{},
        hasChanges: true
      }


    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep({}, source)
    console.log(`${JSON.stringify(merged)}`)
    expect(merged).toEqual(expected)
  })
      

  it('CompareDeep Test when target is from the api', () => {
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
      additions: [],
      modifications: [
        {
          protection: {
            required_pull_request_reviews: {
              dismiss_stale_reviews: false
            }
          }
        }
      ],
      hasChanges: true
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target.branches, source.branches)
    console.log(`${JSON.stringify(merged)}`)
    expect(merged).toEqual(expected)
  })

  it('CompareDeep label with ignorable extra info Works', () => {
    const source = { entries: [{"id":3954990840,"node_id":"LA_kwDOHC6_Gc7rvF74","url":"https://api.github.com/repos/decyjphr-org/test2/labels/bug","name":"bug","color":"CC0000","default":true,"description":"An issue with the system"},{"id":4015763857,"node_id":"LA_kwDOHC6_Gc7vW7GR","url":"https://api.github.com/repos/decyjphr-org/test2/labels/feature","name":"feature","color":"336699","default":false,"description":"New functionality."},{"id":4015763934,"node_id":"LA_kwDOHC6_Gc7vW7He","url":"https://api.github.com/repos/decyjphr-org/test2/labels/first-timers-only","name":"first-timers-only","color":"326699","default":false,"description":null},{"id":4015763984,"node_id":"LA_kwDOHC6_Gc7vW7IQ","url":"https://api.github.com/repos/decyjphr-org/test2/labels/new-label","name":"new-label","color":"326699","default":false,"description":null}]}
    const target = { entries: [{"name":"bug","color":"CC0000","description":"An issue with the system"},{"name":"feature","color":"336699","description":"New functionality."},{"name":"first-timers-only","oldname":"Help Wanted","color":"326699"},{"name":"new-label","oldname":"Help Wanted","color":"326699"}]}
  

    const expected = {
      additions: {},
      modifications: {}
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    console.log(`${JSON.stringify(merged)}`)
    expect(merged.additions).toEqual(expected.additions)
    expect(merged.modifications.length).toEqual(expected.modifications.length)
  })
    
  it('CompareDeep topics ', () => {
    const source = { entries: ["blue","green","newone","red","uber","yellow"]}
    const target = { entries: ["red","blu"]}
  

    const expected = {
      additions: {
        entries:["blue","green","newone","uber","yellow"]
      },
      modifications:{}
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    console.log(`${JSON.stringify(merged)}`)
    expect(merged.additions).toEqual(expected.additions)
    expect(merged.modifications.length).toEqual(expected.modifications.length)
  })

  it('CompareDeep arrays deep ', () => {
    const source = [{name: "blue", color: "green"},{name: "newone",color: "red"},{ name: "uber",color: "yellow"}]
    const target = [{name: "blue", color: "blue"}]
  
    const expected = {
      additions:[{name:"newone",color:"red"},{name:"uber",color:"yellow"}],
      modifications:[{color:"green",name:"blue"}],
      hasChanges:true
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    console.log(`${JSON.stringify(merged)}`)
    expect(merged.additions).toEqual(expected.additions)
    expect(merged.modifications.length).toEqual(expected.modifications.length)
  })
})
