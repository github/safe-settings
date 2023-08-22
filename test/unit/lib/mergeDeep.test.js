/* eslint-disable no-undef */
const MergeDeep = require('../../../lib/mergeDeep')
const YAML = require('js-yaml')
const log = require('pino')('test.log')
  
describe('MergeDeep Test', () => {
  it('CompareDeep extensive test', () => {
    const target = YAML.load(`
repository:
  # A short description of the repository that will show up on GitHub
  description: description of the repos 
      
  # A comma-separated list of topics to set on the repository
  topics: 
  - uber 
  - newone 
branches:
  # If the name of the branch is default, it will create a branch protection for the default branch in the repo
  - name: default
    # https://developer.github.com/v3/repos/branches/#update-branch-protection
    # Branch Protection settings. Set to null to disable
    protection:
      # Required. Require at least one approving review on a pull request, before merging. Set to null to disable.
      required_pull_request_reviews:
        # The number of approvals required. (1-6)
        required_approving_review_count: 2
        # Dismiss approved reviews automatically when a new commit is pushed.
        dismiss_stale_reviews: true
        # Blocks merge until code owners have reviewed.
        require_code_owner_reviews: true
        # Specify which users and teams can dismiss pull request reviews. Pass an empty dismissal_restrictions object to disable. User and team dismissal_restrictions are only available for organization-owned repositories. Omit this parameter for personal repositories.
        dismissal_restrictions:
          users: []
          teams: []
      # Required. Require status checks to pass before merging. Set to null to disable
      required_status_checks:
        # Required. Require branches to be up to date before merging.
        strict: true
        # Required. The list of status checks to require in order to merge into this branch
        contexts: []
      # Required. Enforce all configured restrictions for administrators. Set to true to enforce required status checks for repository administrators. Set to null to disable.
      enforce_admins: true
      # Required. Restrict who can push to this branch. Team and user restrictions are only available for organization-owned repositories. Set to null to disable.
      restrictions:
        apps: []
        users: []
        teams: []
        `)

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
  
  labels:  
    # Labels: define labels for Issues and Pull Requests
    - name: green
      color: '#B60205'
      description: An issue sswithss the system 
      
  validator:
    #pattern: '[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+.*' 
    pattern: '[a-zA-Z0-9_-]+'  
    
  collaborators:
  - username: regpaco
    permission: pull
  
  branches:      
    - name: feature1 
      # https://developer.github.com/v3/repos/branches/#update-branch-protection
      # Branch Protection settings. Set to null to disable
      protection:
        # Required. Require at least one approving review on a pull request, before merging. Set to null to disable.
        required_pull_request_reviews:
          # The number of approvals required. (1-6)
          required_approving_review_count: 5
          # Dismiss approved reviews automatically when a new commit is pushed.
          dismiss_stale_reviews: true
          # Blocks merge until code owners have reviewed.
          require_code_owner_reviews: true
          # Specify which users and teams can dismiss pull request reviews. Pass an empty dismissal_restrictions object to disable. User and team dismissal_restrictions are only available for organization-owned repositories. Omit this parameter for personal repositories.
          dismissal_restrictions:
            users: []
            teams: []
        # Required. Require status checks to pass before merging. Set to null to disable
        required_status_checks:
          # Required. Require branches to be up to date before merging.
          strict: true
          # Required. The list of status checks to require in order to merge into this branch
          contexts: []
        # Required. Enforce all configured restrictions for administrators. Set to true to enforce required status checks for repository administrators. Set to null to disable.
        enforce_admins: false
        # Required. Restrict who can push to this branch. Team and user restrictions are only available for organization-owned repositories. Set to null to disable.
        restrictions:
          apps: []
          users: [] 
          teams: []    
        `)

    const expected = {
      additions: {
        repository: {
          name: "test",
          org: "decyjphr-org",
          homepage: "https://newhome.github.io/",
          topics: [
            "red"
          ],
          auto_init: true,
          has_issues: true,
          has_projects: true,
          has_downloads: true,
          allow_squash_merge: true,
          default_branch: "develop"
        },
        labels: [
            {
              name: "green",
              color: "#B60205",
              description: "An issue sswithss the system"
            }
        ],
        validator: {
          pattern: "[a-zA-Z0-9_-]+"
        },
        collaborators: [
            {
              username: "regpaco",
              permission: "pull"
            }
        ],
        branches: [
          {
            name: "feature1",
            protection: {
              required_pull_request_reviews: {
                required_approving_review_count: 5,
                dismiss_stale_reviews: true,
                require_code_owner_reviews: true,
                dismissal_restrictions: {
                  users: [],
                  teams: []
                }
              },
              required_status_checks: {
                strict: true,
                contexts: []
              },
              enforce_admins: false,
              restrictions: {
                apps: [],
                users: [],
                teams: []
              }
            }
          }
        ]
      },
      modifications: {
        repository: {
          description: "description of test repository",
          name: "test"
        }
      },
      hasChanges: true
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    console.log(`source ${JSON.stringify(source, null, 2)}`)
    console.log(`target ${JSON.stringify(target, null, 2)}`)
    console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
    expect(merged.additions).toEqual(expected.additions)
    expect(merged.modifications.length).toEqual(expected.modifications.length)

    console.log(`target = ${JSON.stringify(target, null, 2)}`)
    const overrideConfig = mergeDeep.mergeDeep({}, target, source)

    console.log(`overrideConfig = ${JSON.stringify(overrideConfig, null, 2)}`)

    const same = mergeDeep.compareDeep(overrideConfig, source)
    console.log(`new diffs ${JSON.stringify(same, null, 2)}`)
    expect(same.additions).toEqual({})
    expect(same.modifications).toEqual({})
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
      console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
      expect(merged.additions).toEqual(expected.additions)
      expect(merged.modifications.length).toEqual(expected.modifications.length)
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
      console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
      expect(merged.additions).toEqual(expected.additions)
      expect(merged.modifications.length).toEqual(expected.modifications.length)
  
      const overrideConfig = mergeDeep.mergeDeep({}, {}, source)
      const same = mergeDeep.compareDeep(overrideConfig, source)
      expect(same.additions).toEqual({})
      expect(same.modifications).toEqual({})
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
      additions: {},
      modifications: {
        branches: [
          {
            protection: {
              required_pull_request_reviews: {
                dismiss_stale_reviews: false
              }
            },
            name: "master"
          }
        ]
      },
      hasChanges: true
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    console.log(`source ${JSON.stringify(source, null, 2)}`)
    console.log(`target ${JSON.stringify(target, null, 2)}`)
    console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
    expect(merged.additions).toEqual(expected.additions)
    expect(merged.modifications.length).toEqual(expected.modifications.length)

    const overrideConfig = mergeDeep.mergeDeep({}, target, source)
    const same = mergeDeep.compareDeep(overrideConfig, source)
    expect(same.additions).toEqual({})
    expect(same.modifications).toEqual({})
  })

  it('Merge labels with ignorable extra info Works', () => {
    const source = { entries: [{"id":3954990840,"node_id":"LA_kwDOHC6_Gc7rvF74","url":"https://api.github.com/repos/decyjphr-org/test2/labels/bug","name":"bug","color":"CC0000","default":true,"description":"An issue with the system"},{"id":4015763857,"node_id":"LA_kwDOHC6_Gc7vW7GR","url":"https://api.github.com/repos/decyjphr-org/test2/labels/feature","name":"feature","color":"336699","default":false,"description":"New functionality."},{"id":4015763934,"node_id":"LA_kwDOHC6_Gc7vW7He","url":"https://api.github.com/repos/decyjphr-org/test2/labels/first-timers-only","name":"first-timers-only","color":"326699","default":false,"description":null},{"id":4015763984,"node_id":"LA_kwDOHC6_Gc7vW7IQ","url":"https://api.github.com/repos/decyjphr-org/test2/labels/new-label","name":"new-label","color":"326699","default":false,"description":null}]}
    const target = { entries: [{"name":"bug","color":"CC0000","description":"An issue with the system"},{"name":"feature","color":"336699","description":"New functionality."},{"name":"first-timers-only","oldname":"Help Wanted","color":"326699"},{"name":"new-label","oldname":"Help Wanted","color":"326699"}]}
  
    const expected = {
      additions: {},
      modifications: {}
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    // console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
    expect(merged.additions).toEqual(expected.additions)
    expect(merged.modifications.length).toEqual(expected.modifications.length)


    const overrideConfig = mergeDeep.mergeDeep({}, target, source)
    // console.log(`overrideConfig = ${JSON.stringify(overrideConfig, null, 2)}`)
    const same = mergeDeep.compareDeep(overrideConfig, target)
    // console.log(`new diffs ${JSON.stringify(same, null, 2)}`)
    expect(same.additions).toEqual({})
    expect(same.modifications).toEqual({})
  })  

  it('Merge labels ', () => { 
    const source = YAML.load(`
    repository:
      name: new
      home: new home
    labels:  
    # Labels: define labels for Issues and Pull Requests
    - name: green
      color: '#B60205'
      description: An issue sswithss the system     
         
    `)
    const target = YAML.load(`
  repository:
    name: new
    home: old home  
    `)
    const expected = {
        additions: {
          labels: [
            {
              name: "green",
              color: "#B60205",
              description: "An issue sswithss the system"
            }           
          ]
        },
        modifications: {},
        hasChanges: true
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    // console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
    expect(merged.additions).toEqual(expected.additions)
    expect(merged.modifications.length).toEqual(expected.modifications.length)


    const overrideConfig = mergeDeep.mergeDeep({}, target, source)
    // console.log(`overrideConfig = ${JSON.stringify(overrideConfig, null, 2)}`)
    const same = mergeDeep.compareDeep(overrideConfig, source)
    // console.log(`new diffs ${JSON.stringify(same, null, 2)}`)
    expect(same.additions).toEqual({})
    expect(same.modifications).toEqual({})
  }) 

  it('Compare nested arrays deep', () => {
    const source = {colors: [{name: "blue", color: "green"},{name: "newone",color: "red"},{ name: "uber",color: "yellow"}]}
    const target = {colors: [{name: "blue", color: "blue", anotherArray:[1,2,3]}, {name: "blu", color: "blu"}]}
  
    // Note: properties in the target and not in source won't show up as deletions. This is by design.
    const expected = {
      additions:{colors: [{name:"newone",color:"red"},{name:"uber",color:"yellow"}]},
      modifications: {colors: [{color:"green",name:"blue"}]},
      hasChanges:true
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
    expect(merged.additions).toEqual(expected.additions)
    expect(merged.modifications.length).toEqual(expected.modifications.length)


    const overrideConfig = mergeDeep.mergeDeep({}, target, source)
    console.log(`overrideConfig = ${JSON.stringify(overrideConfig, null, 2)}`)
    const same = mergeDeep.compareDeep(overrideConfig, source)
    console.log(`new diffs ${JSON.stringify(same, null, 2)}`)
    expect(same.additions).toEqual({})
    expect(same.modifications).toEqual({})
  })

  it('Merge array of topics', () => {
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
    console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
    expect(merged.additions).toEqual(expected.additions)
    expect(merged.modifications.length).toEqual(expected.modifications.length)

    const overrideConfig = mergeDeep.mergeDeep({}, target, source)
    const same = mergeDeep.compareDeep(overrideConfig, target)
    expect(same.additions).toEqual({})
    expect(same.modifications).toEqual({})
  })

  it('Merge branch protections with context sub arrays', () => {
    const source = YAML.load(`
  branches:
  - name: default
    protection:
      required_pull_request_reviews:
        required_approving_review_count: 1
        dismiss_stale_reviews: true
        require_code_owner_reviews: true
      required_status_checks:
        strict: true
        contexts:
          - "🔃 pre-commit"
      enforce_admins: true
      restrictions: null
      allow_force_pushes: false
      allow_deletions: false
      block_creations: true
      required_conversation_resolution: true
      `)
    
    const target = YAML.load(`
    branches:
    - name: default
      protection:
        required_status_checks:
          strict: true
          contexts:
            - "Lint, compile and build"    
    `)
  
    const expected = {
      additions:{},
      modifications: {
        branches: [{
          protection: {
            required_pull_request_reviews: {
              required_approving_review_count:1,
              dismiss_stale_reviews:true,
              require_code_owner_reviews:true
            },
            required_status_checks:{
              contexts:[
                "🔃 pre-commit"
              ]
            },
            enforce_admins:true,
            block_creations:true,
            required_conversation_resolution:true
          }
        }]
      },
      hasChanges:true
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    // console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
    expect(merged.additions).toEqual(expected.additions)
    expect(merged.modifications.length).toEqual(expected.modifications.length)


    const overrideConfig = mergeDeep.mergeDeep({}, target, source)
    // console.log(`overrideConfig = ${JSON.stringify(overrideConfig, null, 2)}`)
    const same = mergeDeep.compareDeep(overrideConfig, target)
    // console.log(`new diffs ${JSON.stringify(same, null, 2)}`)
    expect(same.additions).toEqual({})
    expect(same.modifications).toEqual({})
  })  

  it('Simple compare', () => {
    const source = YAML.load(`
  x:
  - name: default
    values: 
      a: [a,b,c]
  - name: new
    values: 
      a: [b]
      `)
    
    const target = YAML.load(`
    x:
    - name: default
      values: 
        a: [c,a]    
    `)
  
    const expected = JSON.parse(`{"additions":{"x":[{"name":"new","values":{"a":["b"]}}]},"modifications":{"x":[{"values":{"a":["b"]},"name":"default"}]},"hasChanges":true}`)
    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    // console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
    expect(merged.additions).toEqual(expected.additions)
    expect(merged.modifications.length).toEqual(expected.modifications.length)


    const overrideConfig = mergeDeep.mergeDeep({}, target, source)
    // console.log(`overrideConfig = ${JSON.stringify(overrideConfig, null, 2)}`)
    const same = mergeDeep.compareDeep(overrideConfig, target)
    // console.log(`new diffs ${JSON.stringify(same, null, 2)}`)
    expect(same.additions).toEqual({})
    expect(same.modifications).toEqual({})
  })
  
  it('Repo test', () => {

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
  
    const expected = {
      additions: {
        repository: {
          name: "test",
          org: "decyjphr-org",
          homepage: "https://newhome.github.io/",
          topics: [
            "red"
          ],
          auto_init: true,
          has_issues: true,
          has_projects: true,
          has_downloads: true,
          allow_squash_merge: true,
          default_branch: "develop"
        }
      },
      modifications: {
        repository: {
          description: "description of test repository",
          name: "test"
        }
      },
      hasChanges: true
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    //console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
    expect(merged.additions).toEqual(expected.additions)
    expect(merged.modifications.length).toEqual(expected.modifications.length)

    //console.log(`target = ${JSON.stringify(target, null, 2)}`)
    const overrideConfig = mergeDeep.mergeDeep({}, target, source)

    //console.log(`overrideConfig = ${JSON.stringify(overrideConfig, null, 2)}`)

    const same = mergeDeep.compareDeep(overrideConfig, source)
    //console.log(`new diffs ${JSON.stringify(same, null, 2)}`)
    expect(same.additions).toEqual({})
    expect(same.modifications).toEqual({})

  })
  
  it('Autolinks test', () => {
    const source = YAML.load(`
entries:
- key_prefix: ASDF-
  url_template: https://jira.company.com/browse/ASDF-<num>
- key_prefix: BOLIGRAFO-
  url_template: https://jira.company.com/browse/BOLIGRAFO-<num>
  `)
    const target = []
    const expected = {
      additions: {
       entries: [
          {
            key_prefix: "ASDF-",
            url_template: "https://jira.company.com/browse/ASDF-<num>"
          },
          {
            key_prefix: "BOLIGRAFO-",
            url_template: "https://jira.company.com/browse/BOLIGRAFO-<num>"
          }
        ]
      },
      modifications: {},
      hasChanges: true
    }
    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
    expect(merged).toEqual(expected)
  })

  it('Autolinks different prefixes test', () => {
    const source = YAML.load(`
entries:
- key_prefix: ASDF-
  url_template: https://jira.company.com/browse/ASDF-<num>
- key_prefix: BOLIGRAFO-
  url_template: https://jira.company.com/browse/BOLIGRAFO-<num>
  `)
    const target = YAML.load(`
    entries:
    - key_prefix: ASDF-
      url_template: https://jiranew.company.com/browse/ASDF-<num>
    - key_prefix: BOLSIGRAFO-
      url_template: https://jira.company.com/browse/BOLIGRAFO-<num>
      `)
    const expected = {
      additions: {
       entries: [
          {
            key_prefix: "BOLIGRAFO-",
            url_template: "https://jira.company.com/browse/BOLIGRAFO-<num>"
          }
        ]
      },
      modifications: {
      },
      deletions: {
        entries: [ {
          key_prefix: "BOLSIGRAFO-",
          url_template: "https://jira.company.com/browse/BOLIGRAFO-<num>"
        },]
      },
      hasChanges: true
    }
    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
    expect(merged).toEqual(expected)
  })

  it('CompareDeep does not mutate source object', () => {
    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const target = {
      teams: [
        { name: 'developers' },
        { name: 'marketing' }
      ]
    }
    const source = {
      teams: ['developers']
    }
    mergeDeep.compareDeep(target, source)
  
    // const result = mergeDeep.compareDeep(target, source)
    // console.log(`source ${JSON.stringify(source, null, 2)}`)
    // console.log(`target ${JSON.stringify(target, null, 2)}`)
    // console.log(`result ${JSON.stringify(result, null, 2)}`)
  
    expect(source.teams).toEqual(['developers'])
  })

  it('CompareDeep produces correct result for arrays of named objects', () => {
    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const target = {
      teams: [
        { name: 'developers' },
        { name: 'marketing' }
      ]
    }
    const source = {
      teams: ['developers']
    }
    const result = mergeDeep.compareDeep(target, source)
  
    console.log(`source ${JSON.stringify(source, null, 2)}`)
    console.log(`target ${JSON.stringify(target, null, 2)}`)
    console.log(`result ${JSON.stringify(result, null, 2)}`)
  
    expect(result.deletions.teams).toEqual([{ name: 'marketing' }])
  })
  
  
  it('CompareDeep result has changes when source is empty and target is not', () => {
    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const target = {
      required_pull_request_reviews: {
        dismissal_restrictions: {
          apps: [],
          teams: [],
          users: [{ login: 'test' }, { login: 'test2' }]
        }
      }
    }
  
    const source = {
      required_pull_request_reviews: {
        dismissal_restrictions: {
          apps: [],
          teams: [],
          users: []
        }
      }
    }
    const result = mergeDeep.compareDeep(target, source)
  
    expect(result.hasChanges).toBeTruthy()
  })
  
  it('CompareDeep result has no change when source and target match', () => {
    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const target = {
      required_pull_request_reviews: {
        dismissal_restrictions: {
          apps: [],
          teams: [],
          users: [{ login: 'test' }, { login: 'test2' }]
        }
      }
    }
  
    const source = {
      required_pull_request_reviews: {
        dismissal_restrictions: {
          apps: [],
          teams: [],
          users: [{ login: 'test' }, { login: 'test2' }]
        }
      }
    }
    const result = mergeDeep.compareDeep(target, source)
  
    expect(result.hasChanges).toBeFalsy()
  })
  
  it('CompareDeep finds modifications on top-level arrays with different ordering', () => {
    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const target = [
        { username: 'collaborator-1' },
        { username: 'collaborator-2' },
      ]
    const source = [
        { username: 'collaborator-2' },
        { username: 'collaborator-1' },
      ]
    const result = mergeDeep.compareDeep(target, source)
  
    expect(result.hasChanges).toBeFalsy()
  })
  
  it('CompareDeep does not report changes for matching empty targets', () => {
    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const target = []
    const source = []
    const result = mergeDeep.compareDeep(target, source)
  
    expect(result.hasChanges).toBeFalsy()
  })

  it('Compare array as toplevel object', () => {
    const source = [
      {
        "username": "iksafagr",
        "pendinginvite": false,
        "permission": "admin"
      }
    ]
    const target = [
      {
        "username": "iksafagr",
        "pendinginvite": false,
        "permission": "admin"
      },
      {
        "username": "iksathrr",
        "pendinginvite": false,
        "permission": "admin"
      }
    ]
  
    const expected = {
      deletions: [{
          "username": "iksathrr",
          "pendinginvite": false,
          "permission": "admin"
    }],
      modifications:{}
    }

    const ignorableFields = []
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
    expect(merged.deletions).toEqual(expected.deletions)
    expect(merged.modifications.length).toEqual(expected.modifications.length)

    const overrideConfig = mergeDeep.mergeDeep({}, target, source)
    const same = mergeDeep.compareDeep(overrideConfig, target)
    expect(same.additions).toEqual({})
    expect(same.modifications).toEqual({})
    expect(same.modifications).toEqual({})
  })
  
  it('Ruleset Compare Works when no changes', () => {
    const target = [
      {
        "id": 68617,
        "name": "demo",
        "target": "branch",
        "source_type": "Organization",
        "source": "decyjphr-scale-test",
        "enforcement": "disabled",
        "conditions": {
          "ref_name": {
            "exclude": [
              "refs/heads/oldmaster"
            ],
            "include": [
              "~DEFAULT_BRANCH"
            ]
          },
          "repository_name": {
            "exclude": [
              "test",
              "test1"
            ],
            "include": [
              "test*"
            ],
            "protected": true
          }
        },
        "rules": [
          {
            "type": "creation"
          },
          {
            "type": "update"
          },
          {
            "type": "deletion"
          },
          {
            "type": "required_linear_history"
          },
          {
            "type": "required_signatures"
          },
          {
            "type": "pull_request",
            "parameters": {
              "require_code_owner_review": true,
              "require_last_push_approval": true,
              "dismiss_stale_reviews_on_push": true,
              "required_approving_review_count": 10,
              "required_review_thread_resolution": true
            }
          },
          {
            "type": "commit_message_pattern",
            "parameters": {
              "name": "test commit_message_pattern",
              "negate": true,
              "pattern": "skip*",
              "operator": "starts_with"
            }
          },
          {
            "type": "commit_author_email_pattern",
            "parameters": {
              "name": "test commit_author_email_pattern",
              "negate": false,
              "pattern": "^.*@example.com$",
              "operator": "regex"
            }
          },
          {
            "type": "committer_email_pattern",
            "parameters": {
              "name": "test committer_email_pattern",
              "negate": false,
              "pattern": "^.*@example.com$",
              "operator": "regex"
            }
          },
          {
            "type": "branch_name_pattern",
            "parameters": {
              "name": "test branch_name_pattern",
              "negate": false,
              "pattern": ".*/.*",
              "operator": "regex"
            }
          }
        ],
        "node_id": "RRS_lACkVXNlcs4GH_FizgABDAk",
        "_links": {
          "self": {
            "href": "https://api.github.com/orgs/decyjphr-scale-test/rulesets/68617"
          },
          "html": {
            "href": "https://github.com/organizations/decyjphr-scale-test/settings/rules/68617"
          }
        },
        "created_at": "2023-08-11T15:55:49.071Z",
        "updated_at": "2023-08-11T15:55:49.139Z",
        "bypass_actors": [
          {
            "actor_id": 1,
            "actor_type": "OrganizationAdmin",
            "bypass_mode": "pull_request"
          }
        ]
      }
    ] 
    const source = [
      {
        "name": "demo",
        "target": "branch",
        "enforcement": "disabled",
        "bypass_actors": [
          {
            "actor_id": 1,
            "actor_type": "OrganizationAdmin",
            "bypass_mode": "pull_request"
          }
        ],
        "conditions": {
          "ref_name": {
            "include": [
              "~DEFAULT_BRANCH"
            ],
            "exclude": [
              "refs/heads/oldmaster"
            ]
          },
          "repository_name": {
            "include": [
              "test*"
            ],
            "exclude": [
              "test",
              "test1"
            ],
            "protected": true
          }
        },
        "rules": [
          {
            "type": "creation"
          },
          {
            "type": "update"
          },
          {
            "type": "deletion"
          },
          {
            "type": "required_linear_history"
          },
          {
            "type": "required_signatures"
          },
          {
            "type": "pull_request",
            "parameters": {
              "dismiss_stale_reviews_on_push": true,
              "require_code_owner_review": true,
              "require_last_push_approval": true,
              "required_approving_review_count": 10,
              "required_review_thread_resolution": true
            }
          },
          {
            "type": "commit_message_pattern",
            "parameters": {
              "name": "test commit_message_pattern",
              "negate": true,
              "operator": "starts_with",
              "pattern": "skip*"
            }
          },
          {
            "type": "commit_author_email_pattern",
            "parameters": {
              "name": "test commit_author_email_pattern",
              "negate": false,
              "operator": "regex",
              "pattern": "^.*@example.com$"
            }
          },
          {
            "type": "committer_email_pattern",
            "parameters": {
              "name": "test committer_email_pattern",
              "negate": false,
              "operator": "regex",
              "pattern": "^.*@example.com$"
            }
          },
          {
            "type": "branch_name_pattern",
            "parameters": {
              "name": "test branch_name_pattern",
              "negate": false,
              "operator": "regex",
              "pattern": ".*/.*"
            }
          }
        ]
      }
    ] 
    const ignorableFields = ['id', 'node_id', 'default', 'url']
    const mergeDeep = new MergeDeep(log, ignorableFields)
    const merged = mergeDeep.compareDeep(target, source)
    expect(merged.hasChanges).toBeFalsy()
    //console.log(`source ${JSON.stringify(source, null, 2)}`)
    //console.log(`target ${JSON.stringify(target, null, 2)}`)
    //console.log(`diffs ${JSON.stringify(merged, null, 2)}`)
  })
  
})
