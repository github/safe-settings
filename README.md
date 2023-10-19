# GitHub Safe-Settings

[![Create a release](https://github.com/github/safe-settings/actions/workflows/create-release.yml/badge.svg)](https://github.com/github/safe-settings/actions/workflows/create-release.yml)

`Safe-settings`– an app to manage policy-as-code and apply repository settings to repositories across an organization.

1. In `safe-settings` all the settings are stored centrally in an `admin` repo within the organization. This is important. Unlike [Settings Probot](https://github.com/probot/settings), the settings files cannot be in individual repositories.  
    > **Note**
    > It is possible to override this behavior and specify a custom repo instead of the `admin` repo.<br>
    > This could be done by setting an `env` variable called `ADMIN_REPO`.

1. The **settings** in the **default** branch is applied. If the settings are changed in a non-default branch and a PR is created to merge the changes, it would be run in a `dry-run` mode to evaluate and validate the settings, and checks would pass or fail based on that.
2. In `safe-settings` the settings can have 2 types of targets:
   1. `org` - These settings are applied to the `org`. `Org`-targeted settings are defined in `.github/settings.yml` . Currently, only `rulesets` are supported as `org`-targeted settings.
   2. `repo` - These settings are applied to `repos`
   
3. For The `repo`-targeted settings there can be at 3 levels at which the settings could be managed:
   1. Org-level settings are defined in `.github/settings.yml`  
       > **Note**
       > It is possible to override this behavior and specify a different filename for the `settings` yml repo.<br>
       > This could be done by setting an `env` variable called `SETTINGS_FILE_PATH`.

   2. `Suborg` level settings. A `suborg` is an arbitrary collection of repos belonging to projects, business units, or teams. The `suborg` settings reside in a yaml file for each `suborg` in the `.github/suborgs` folder.
   3. `Repo` level settings. They reside in a repo specific yaml in `.github/repos` folder
4. It is recommended to break the settings into org-level, suborg-level, and repo-level units. This will allow different teams to define and manage policies for their specific projects or business units. With `CODEOWNERS`, this will allow different people to be responsible for approving changes in different projects.

> **Note**
> `Suborg` and `Repo` level settings directory structure cannot be customized.

> **Note**
> The settings file must have a `.yml` extension only. `.yaml` extension is ignored, for now.

## How it works

### Events
The App listens to the following webhook events:

- **push**: If the settings are created or modified, that is, if  push happens in the `default` branch of the `admin` repo and the file added or changed is `.github/settings.yml` or `.github/repos/*.yml`or `.github/suborgs/*.yml`, then the settings would be applied either globally to all the repos, or specific repos. For each repo, the settings that are actually applied depend on the default settings for the org, overlayed with settings for the suborg that the repo belongs to, overlayed with the settings for that specific repo.
  
- **repository.created**: If a repository is created in the org, the settings for the repo - the default settings for the org, overlayed with settings for the suborg that the repo belongs to, overlayed with the settings for that specific repo - is applied. 

- **branch_protection_rule**: If a branch protection rule is modified or deleted, `safe-settings` will `sync` the settings to prevent any unauthorized changes.

- **repository.edited**: If the default branch is renamed, `safe-settings` will `sync` the settings, returning the default branch to the configured value for the repo.

- **pull_request.opened**, **pull_request.reopened**, **check_suite.requested**: If the settings are changed, but it is not in the `default` branch, and there is an existing PR, the code will validate the settings changes by running safe-settings in `nop` mode and update the PR with the `dry-run` status. 

- **repository_ruleset**: If the `ruleset` settings are modified in the UI manually, `safe-settings` will `sync` the settings to prevent any unauthorized changes.

- **member_change_events**: If a member is added or removed from a repository, `safe-settings` will `sync` the settings to prevent any unauthorized changes.
  
### Restricting `safe-settings` to specific repos
`safe-settings` can be turned on only to a subset of repos by specifying them in the runtime settings file, `deployment-settings.yml`.  
If no file is specified, then the following repositories -  `'admin', '.github', 'safe-settings'` are exempted by default.  
A sample of `deployment-settings` file is found [here](docs/sample-settings/sample-deployment-settings.yml).

To apply `safe-settings` __only__ to a specific list of repos, add them to the `restrictedRepos` section as `include` array.

To ignore `safe-settings` for a specific list of repos, add them to the `restrictedRepos` section as `exclude` array.

> **Note**
> The `include` and `exclude` attributes support as well regular expressions.

### Custom rules

Admins setting up `safe-settings` can include custom rules that would be validated before applying a setting or overidding a broader scoped setting.

The code has to return `true` if validation is successful, or `false` if it isn't.  

If the validation fails, the `error` attribute specified would be used to create the error message in the logs or in the `PR checks`.

The first use case is where a custom rule has to be applied for a setting on its own. For e.g. No collaborator should be given `admin` permissions. 

For this type of validation, admins can provide custom code as `configvalidators` which validates the setting by itself. 

For e.g. for the case above, it would look like:
```yaml
configvalidators:
  - plugin: collaborators
    error: |
      `Admin role cannot be assigned to collaborators`
    script: |
      console.log(`baseConfig ${JSON.stringify(baseconfig)}`)
      return baseconfig.permission != 'admin'
```

For convenience this script has access to a variable, `baseconfig`, that contains the setting that is be applied.

The second use case is where custom rule has to be applied when a setting in the org or suborg level is being overridden. Such as, when default branch protection is being overridden.

For this type of validation, admins can provide custom code as `overridevalidators`. The script can access two variables, `baseconfig` and `overrideconfig` which represent the base setting and the setting that is overriding it.  

A sample would look like:

```yaml
overridevalidators:
  - plugin: branches   
    error: |
      `Branch protection required_approving_review_count cannot be overidden to a lower value`
    script: |
      console.log(`baseConfig ${JSON.stringify(baseconfig)}`)
      console.log(`overrideConfig ${JSON.stringify(overrideconfig)}`)
      if (baseconfig.protection.required_pull_request_reviews.required_approving_review_count && overrideconfig.protection.required_pull_request_reviews.required_approving_review_count ) {
        return overrideconfig.protection.required_pull_request_reviews.required_approving_review_count >= baseconfig.protection.required_pull_request_reviews.required_approving_review_count 
      }
      return true
```

A sample of `deployment-settings` file is found [here](docs/sample-settings/sample-deployment-settings.yml).

### Performance
When there are 1000s of repos to be managed -- and there is a global settings change -- safe-settings will have to work efficiently and only make the necessary API calls.

The app also has to complete the work within an hour: the lifetime of the GitHub app token.

To address these constraints the following design decisions have been implemented:
1. `Probot` automatically handles `rate` and `abuse` limits.
2. Instead of loading all the repo contents from `.github/repos/*`, it will selectively load the specific repo file based on which `repo` settings has changed, or a subset of the repo files associated with `suborg` settings that has changed. The only time all the repo files will be loaded is if there is a `global` settings file change.
3. The PR check will only provide a summary of errors and changes. (Providing the details of changes for 1000s of repos will error out.)
4. To ensure it handles updates to GitHub intelligently, it will compare the changes with the settings in GitHub, and  will call the API only if there are `real` changes.

#### Comparing changes with GitHub
To determine if there are `real` changes, the code will generate a detailed list of `additions`, `modifications`, and `deletions` compared to the settings in GitHub:

For e.g:

If the settings is:
```json
{
  "branches": [
    {
      "name": "master",
      "protection": {
        "required_pull_request_reviews": {
          "required_approving_review_count": 2,
          "dismiss_stale_reviews": false,
          "require_code_owner_reviews": true,
          "dismissal_restrictions": {}
        },
        "required_status_checks": {
          "strict": true,
          "contexts": []
        },
        "enforce_admins": false
      }
    }
  ]
}
```

and the settings in GitHub is:
```json
{
  "branches": [
    {
      "name": "master",
      "protection": {
        "url": "https://api.github.com/repos/decyjphr-org/test/branches/develop/protection",
        "required_status_checks": {
          "url": "https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/required_status_checks",
          "strict": true,
          "contexts": [],
          "contexts_url": "https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/required_status_checks/contexts",
          "checks": []
        },
        "restrictions": {
          "url": "https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/restrictions",
          "users_url": "https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/restrictions/users",
          "teams_url": "https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/restrictions/teams",
          "apps_url": "https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/restrictions/apps",
          "users": [],
          "teams": [],
          "apps": []
        },
        "required_pull_request_reviews": {
          "url": "https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/required_pull_request_reviews",
          "dismiss_stale_reviews": true,
          "require_code_owner_reviews": true,
          "required_approving_review_count": 2,
          "dismissal_restrictions": {
            "url": "https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/dismissal_restrictions",
            "users_url": "https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/dismissal_restrictions/users",
            "teams_url": "https://api.github.com/repos/decyjphr-org/test/branches/develop/protection/dismissal_restrictions/teams",
            "users": [],
            "teams": []
          }
        },
        "required_signatures": false,
        "enforce_admins": false,
        "required_linear_history": false,
        "allow_force_pushes": {
          "enabled": false
        },
        "allow_deletions": false,
        "required_conversation_resolution": false
      }
    }
  ]
}
```

the results of comparison would be:
```json
{
      "additions": {},
      "modifications": {
        "branches": [
          {
            "protection": {
              "required_pull_request_reviews": {
                "dismiss_stale_reviews": false
              }
            },
            "name": "master"
          }
        ]
      },
      "deletions": {},
      "hasChanges": true
    }
```
### Schedule
The App can be configured to apply the settings on a schedule. This could be a way to address configuration drift since webhooks are not always guaranteed to be delivered.

To periodically converge the settings to the configuration, set the `CRON` environment variable. This is based on [node-cron](https://www.npmjs.com/package/node-cron) and details on the possible values can be found [here](#env-variables).

### Pull Request Workflow
It is
`Safe-settings` explicitly looks in the `admin` repo in the organization for the settings files. The `admin` repo could be a restricted repository with `branch protections` and `codeowners`  

In that set up, when changes happen to the settings files and there is a PR for merging the changes back to the `default` branch in the `admin` repo, `safe-settings` will run `checks`  – which will run in **nop** mode and produce a report of the changes that would happen, including the API calls and the payload. 

For e.g. If we have `override` validators that will fail if `org-level` branch protections are overridden at the repo or suborg level with a lesser number of required approvers, here is an screenshot of what users will see in the PR.
<p>
<img width="467" alt="image" src="https://github.com/github/safe-settings/assets/57544838/cc5d59fb-3d7c-477b-99e9-94bcafd07c0b">
</p>

> **NOTE**
> If you don't want the PR message to have these details, it can be turned off by `env` setting `CREATE_PR_COMMENT`=`false`

Here is a screenshot of what the users will see in the `checkrun` page:
<p>
<img width="462" alt="image" src="https://github.com/github/safe-settings/assets/57544838/c875224f-894b-45da-a9cc-4bfc75c47670">
</p>

### Error handling
The app creates a `Check` at the end of its processing to indicate if there were any errors. The `Check` is called `safe-settings` and corrosponds to the latest commit on the `default` branch of the `admin` repo.

Here is an example of a `checkrun` result:
<p>
<img width="944" alt="image" src="https://github.com/github/safe-settings/assets/57544838/7ccedcea-628e-4055-a5a5-b8e45123777e">
</p>

And the `checkrun` page will look like this:
<p>
<img width="860" alt="image" src="https://github.com/github/safe-settings/assets/57544838/893ff4e6-904c-4a07-924a-7c23dc068983">
</p>

### The Settings file

The settings file can be used to set the policies at the `Org`, `suborg` or `repo` level. 

Using the settings, the following things could be configured:

- `Repository settings` - home page, url, visibility, has_issues, has_projects, wikis, etc.
- `default branch` - naming and renaming 
- `Repository Topics`
- `Teams and permissions`
- `Collaborators and permissions`
- `Issue labels`
- `Branch protections` - if the name of the branch is `default` in the settings, it is applied to the `default` branch of the repo.
- `Autolinks`
- `repository name validation` using regex pattern

It is possible to provide an `include` or `exclude` settings to restrict the `collaborators`, `teams`, `labels` to a list of repos or exclude a set of repos for a collaborator.

Here is an example settings file:


```yaml
# These settings are synced to GitHub by https://github.com/github/safe-settings

repository: 
  # This is the settings that need to be applied to all repositories in the org 
  # See https://docs.github.com/en/rest/reference/repos#create-an-organization-repository for all available settings for a repository  
  # A short description of the repository that will show up on GitHub
  description: description of the repo
  
  # A URL with more information about the repository
  homepage: https://example.github.io/
    
  # Keep this as true for most cases
  # A lot of the policies below cannot be implemented on bare repos
  # Pass true to create an initial commit with empty README.
  auto_init: true
    
  # A list of topics to set on the repository - can alternatively set like this: [github, probot, new-topic, another-topic, topic-12]
  topics:
  - github
  - probot
  - new-topic
  - another-topic
  - topic-12

  # Settings for Code security and analysis
  # Dependabot Alerts
  security:
    enableVulnerabilityAlerts: true
    enableAutomatedSecurityFixes: true
  
  # Either `true` to make the repository private, or `false` to make it public. 
  # If this value is changed and if Org members cannot change the visibility of repos
  # it would result in an error when updating a repo
  private: true
  
  # Can be public or private. If your organization is associated with an enterprise account using 
  # GitHub Enterprise Cloud or GitHub Enterprise Server 2.20+, visibility can also be internal. 
  visibility: private
  
  # Either `true` to enable issues for this repository, `false` to disable them.
  has_issues: true
  
  # Either `true` to enable projects for this repository, or `false` to disable them.
  # If projects are disabled for the organization, passing `true` will cause an API error.
  has_projects: true
  
  # Either `true` to enable the wiki for this repository, `false` to disable it.
  has_wiki: true
  
  # The default branch for this repository.
  default_branch: main-enterprise
  
  # Desired language or platform [.gitignore template](https://github.com/github/gitignore) 
  # to apply. Use the name of the template without the extension. 
  # For example, "Haskell".
  gitignore_template: node
  
  # Choose an [open source license template](https://choosealicense.com/) 
  # that best suits your needs, and then use the 
  # [license keyword](https://help.github.com/articles/licensing-a-repository/#searching-github-by-license-type) 
  # as the `license_template` string. For example, "mit" or "mpl-2.0".
  license_template: mit
  
  # Either `true` to allow squash-merging pull requests, or `false` to prevent
  # squash-merging.
  allow_squash_merge: true
  
  # Either `true` to allow merging pull requests with a merge commit, or `false`
  # to prevent merging pull requests with merge commits.
  allow_merge_commit: true
  
  # Either `true` to allow rebase-merging pull requests, or `false` to prevent
  # rebase-merging.
  allow_rebase_merge: true
  
  # Either `true` to allow auto-merge on pull requests, 
  # or `false` to disallow auto-merge.
  # Default: `false`
  allow_auto_merge: true
  
  # Either `true` to allow automatically deleting head branches 
  # when pull requests are merged, or `false` to prevent automatic deletion.
  # Default: `false`
  delete_branch_on_merge: true  
      
  # Whether to archive this repository. false will unarchive a previously archived repository.
  archived: false

# The following attributes are applied to any repo within the org
# So if a repo is not listed above is created or edited
# The app will apply the following settings to it
labels:
  # Labels: define labels for Issues and Pull Requests
  include:
    - name: bug
      color: CC0000
      description: An issue with the system

    - name: feature
      # If including a `#`, make sure to wrap it with quotes!
      color: '#336699'
      description: New functionality.

    - name: first-timers-only
      # include the old name to rename an existing label
      oldname: Help Wanted
      color: '#326699'

    - name: new-label
      # include the old name to rename an existing label
      oldname: Help Wanted
      color: '#326699'
  exclude:
    # don't delete any labels created on GitHub that starts with "release"
    - name: ^release

milestones:
# Milestones: define milestones for Issues and Pull Requests
  - title: milestone-title
    description: milestone-description
    # The state of the milestone. Either `open` or `closed`
    state: open

collaborators:
# Collaborators: give specific users access to any repository.
# See https://docs.github.com/en/rest/reference/collaborators#add-a-repository-collaborator for available options
- username: regpaco
  permission: push
# The permission to grant the collaborator. Can be one of:
# * `pull` - can pull, but not push to or administer this repository.
# * `push` - can pull and push, but not administer this repository.
# * `admin` - can pull, push and administer this repository.
- username: beetlejuice
  permission: pull
# You can exclude a list of repos for this collaborator and all repos except these repos would have this collaborator
  exclude:
  - actions-demo
- username: thor
  permission: push
# You can include a list of repos for this collaborator and only those repos would have this collaborator
  include:
  - actions-demo
  - another-repo

teams:
# Teams See https://docs.github.com/en/rest/reference/teams#create-a-team for available options
  - name: core
    # The permission to grant the team. Can be one of:
    # * `pull` - can pull, but not push to or administer this repository.
    # * `push` - can pull and push, but not administer this repository.
    # * `admin` - can pull, push and administer this repository.
    permission: admin
  - name: docss
    permission: push
  - name: docs
    permission: pull
  # Visibility is only honored when the team is created not for existing teams.
  # It can be either secret (default) or closed (visible to all members of the org)
  - name: globalteam
    permission: push
    visibility: closed

branches:
  # If the name of the branch value is specified as `default`, then the app will create a branch protection rule to apply against the default branch in the repo
  - name: default
    # https://docs.github.com/en/rest/reference/branches#update-branch-protection
    # Branch Protection settings. Set to null to disable
    protection:
      # Required. Require at least one approving review on a pull request, before merging. Set to null to disable.
      required_pull_request_reviews:
        # The number of approvals required. (1-6)
        required_approving_review_count: 1
        # Dismiss approved reviews automatically when a new commit is pushed.
        dismiss_stale_reviews: true
        # Blocks merge until code owners have reviewed.
        require_code_owner_reviews: true
        # Whether the most recent reviewable push must be approved by someone other than the person who pushed it.
        require_last_push_approval: true
        # Allow specific users, teams, or apps to bypass pull request requirements. Set to null to disable.
        bypass_pull_request_allowances:
          apps: []
          users: []
          teams: []
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

# See the docs (https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/configuring-autolinks-to-reference-external-resources) for a description of autolinks and replacement values.
autolinks:
  - key_prefix: 'JIRA-'
    url_template: 'https://jira.github.com/browse/JIRA-<num>'
  - key_prefix: 'MYLINK-'
    url_template: 'https://mywebsite.com/<num>'
        
validator:
  #pattern: '[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+.*' 
  pattern: '[a-zA-Z0-9_-]+'
```



### Additional values

In addition to these values above, the settings file can have some additional values:

1. `force_create`: This is set in the repo-level settings to force create the repo if the repo does not exist. 
2. `template`: This is set in the repo-level settings, and is used with the `force_create` flag to use a specific repo template when creating the repo
3. `suborgrepos`: This is set in the suborg-level settings to define an array of repos. This field can also take a `glob` pattern to allow wild-card expression to specify repos in a suborg. For e.g. `test*` would include `test`, `test1`, `testing`, etc.
4. The `suborgteams` section contains a list of teams, and all the repos belonging to the teams would be part of the `suborg` 



### Env variables

You can pass environment variables; easiest way to do it is in a `.env`file.

1. __CRON__ you can pass a cron input to run `safe-settings` at a regular schedule. This is based on [node-cron](https://www.npmjs.com/package/node-cron). For eg.
```
# ┌────────────── second (optional)
# │ ┌──────────── minute
# │ │ ┌────────── hour
# │ │ │ ┌──────── day of month
# │ │ │ │ ┌────── month
# │ │ │ │ │ ┌──── day of week
# │ │ │ │ │ │
# │ │ │ │ │ │
# * * * * * *
CRON=* * * * * # Run every minute
```
2. Logging level could be set using **LOG_LEVEL**. For e.g.
```
LOG_LEVEL=trace
```
3. Enable Pull Request comment using **ENABLE_PR_COMMENT**. For e.g.
```
ENABLE_PR_COMMENT=true
```

### Runtime Settings 

1. Besides the above settings files, the application can be bootstrapped with `runtime` settings.
2. The `runtime` settings are configured in `deployment-settings.yml` that is in the directory from where the GitHub app is running.
3. Currently the only setting that is possible are `restrictedRepos: [... ]` which allows you to configure a list of repos within your `org` that are excluded from the settings. If the `deployment-settings.yml` is not present, the following repos are added by default to the `restricted`repos list: `'admin', '.github', 'safe-settings'`


### Notes

1. Label color can also start with `#`, e.g. `color: '#F341B2'`. Make sure to wrap it with quotes!
1. Each top-level element under branch protection must be filled (eg: `required_pull_request_reviews`, `required_status_checks`, `enforce_admins` and `restrictions`). If you don't want to use one of them you must set it to `null` (see comments in the example above). Otherwise, none of the settings will be applied.
2. The precedence order is repository > suborg > org (.github/repos/*.yml > .github/suborgs/*.yml > .github/settings.yml



## How to use

1. __[Install the app](docs/deploy.md)__. 

2. Create an `admin` repo within your organization (the repository must be called `admin`). 

3. Add the settings for the `org`, `suborgs`, and `repos` . List of sample files could be found [here](docs/sample-settings).

   

## Deployment

See [docs/deploy.md](docs/deploy.md) if you would like to run your own instance of this plugin.

## License

`safe-settings` is licensed under the [ISC license](https://github.com/github/safe-settings/blob/master/LICENSE)

`safe-settings` uses 3rd party libraries, each with their own license. These are found [here](https://github.com/github/safe-settings/blob/master/NOTICE.md).


[dependabot-link]: https://dependabot.com/

[dependabot-badge]: https://badgen.net/dependabot/probot/settings/?icon=dependabot

[github-actions-ci-link]: https://github.com/probot/settings/actions?query=workflow%3A%22Node.js+CI%22+branch%3Amaster

[github-actions-ci-badge]: https://github.com/probot/settings/workflows/Node.js%20CI/badge.svg
