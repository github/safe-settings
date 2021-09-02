# GitHub Safe-Settings

[![Node.js CI](https://github.com/github/safe-settings/actions/workflows/node-ci.yml/badge.svg)](https://github.com/github/safe-settings/actions/workflows/node-ci.yml)
[![Dependabot][dependabot-badge]][dependabot-link]

`Safe-settings`– an app to manage policy-as-code and apply repository settings to repositories across an organization.

It is loosely based on [Settings Probot](https://github.com/probot/settings) GitHub App. However, it differs from the original probot settings app in several important ways:

1. In `safe-settings` all the settings are stored centrally in an `admin` repo within the organization. 
1. There are 3 levels at which the settings could be managed:
   1. Org-level settings are defined in `.github/settings.yml` 
   1. The org-level settings could be overridden at a  `suborg` level. These would be a collection of repos belonging to a project or a business unit, or a team. The `suborg`settings reside in the `.github/suborgs`folder.
   1. Lastly, we could override settings for individual repos by creating a repo specific yaml in `.github/repos`folder
1. `Safe-settings` explicitly looks in the `admin` repo in the organization for the settings files. The `admin` repo should be a restricted repository with `branch protections` and `codeowners` . 
1. To address the scalability concerns for large organizations having thousands of repos, it is recommended to break the settings into org-level, suborg-level, and repo-level units. This will allow different teams to be define and manage policies for their specific projects or business units.



## Table of Contents
[TOC]


## How it works

The App listens to the following webhook events and does the following:

- **push**: If settings are created or settings are modified, that is, if  push happens in the `default` branch of the `admin` repo and the file added or changed is `.github/settings.yml` or `.github/repos/*.yml`or `.github/suborgs/*.yml`, then the settings would be applied either globally to all the repos, or specific repos. For each repo the settings that would be applied depend on the default settings for the org, overlayed with settings for the suborg that the repo belongs to, overlayed with the settings for that specific repo.
  
- **repository.created**: If a repository is created in the org, the settings for the repo - the default settings for the org, overlayed with settings for the suborg that the repo belongs to, overlayed with the settings for that specific repo - is applied. To prevent `infinite loop` if the repo created event is trigged by itself(bot), it would be ignored. This ensures that the policy is enforced even to nee repositories.

- **repository.edited**: If the `default` branch is changed if the the settings that would be applied for the repo

**Exceptions:** Certain repos may be exempted by specifying them in a runtime config file called `depolyment-settings.yml`. If no file is specified, then the following repositories -  `'admin', '.github', 'safe-settings'` are exempted by default.

## How to use

1. __[Install the app](docs/deploy.md)__.
1. Create an `admin` repo within your organization (the repository must be called `admin`).
2. Add the files for `org`,`suborg`, and `repo` settings.

### Settings files

**.github/settings.yml:** This is the org-level settings file. The  `.github/settings.yml` file can have the following sections: 
1. The `repositories`section contains repositories that need to be configured explicitly. This is kept for backward compatibility and is usually left blank as the repository settings are done seperately.
1. The `labels` section contains that labels that need to be created for all the repositories in the org
1. The `collaborators` section contains the list of collaborators that need to be added to all the repositories in the org. It is possible to provide an `include` or `exclude` settings to restrict the collaborator to a list of repos or exclude a set of repos for a collaborator.
1. The `teams` section contains the list of teams that need to be added to all the repositories in the org.
1. The `branches`section contains the list of `branch protections` that need to be applied to all the repos in the org.
1. If the name of the branch is `default` in the settings, it is applied to the `default` branch of the repo.
1. `Validator`section to validate repo names using `regex`patterns

```yaml
# These settings are synced by https://github.com/github/safe-settings
# The `repositories` section contains repositories that need to be configured explicitly
#
# The `labels` section 

repositories: []
 
# The following attributes are applied to any repo within the org
# So if a repo is not listed above is created or edited
# The app will apply the following settings to it
labels:
  # Labels: define labels for Issues and Pull Requests
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

collaborators:
# Collaborators: give specific users access to any repository.
# See https://developer.github.com/v3/repos/collaborators/#add-user-as-a-collaborator for available options

- username: regpaco
  permission: push
# The permission to grant the collaborator. Can be one of:
# * `pull` - can pull, but not push to or administer this repository.
# * `push` - can pull and push, but not administer this repository.
# * `admin` - can pull, push and administer this repository.
- username: beetlejuice
  permission: pull
  exclude:
  - actions-demo
# You can exclude a list of repos for this collaborator and all repos except these repos would have this collaborator
- username: thor
  permission: push
  include:
  - actions-demo
  - another-repo
# You can include a list of repos for this collaborator and only those repos would have this collaborator

# See https://developer.github.com/v3/teams/#add-or-update-team-repository for available options
teams:
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

branches:
  # If the name of the branch is default, it will create a branch protection for the default branch in the repo
  - name: default
    # https://developer.github.com/v3/repos/branches/#update-branch-protection
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
        
validator:
  #pattern: '[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+.*' 
  pattern: '[a-zA-Z0-9_-]+'
```
**.github/suborgs/*.yml:** These files are for suborg settings. The file can have the following sections: 

1. The `suborgrepos`section contains list of repositories that belong to the suborg. The repo names could be a `Glob` pattern to allow wild-card expression to specify repos in a suborg
1. The rest of the sections could be `labels`,`collaborators`, `teams`, `branches`, `Validator` and they would be applied to all the repos in the `suborg`


```yaml
suborgrepos: 
- new-repo
- test* 

# The following attributes are applied to any repo within the suborg
# So if a repo is not listed above is created or edited
# The app will apply the following settings to it
labels:
  # Labels: define labels for Issues and Pull Requests
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

collaborators:
# Collaborators: give specific users access to any repository.
# See https://developer.github.com/v3/repos/collaborators/#add-user-as-a-collaborator for available options

- username: regpaco
  permission: push
# The permission to grant the collaborator. Can be one of:
# * `pull` - can pull, but not push to or administer this repository.
# * `push` - can pull and push, but not administer this repository.
# * `admin` - can pull, push and administer this repository.
- username: beetlejuice
  permission: pull
  exclude:
  - actions-demo
# You can exclude a list of repos for this collaborator and all repos except these repos would have this collaborator
- username: thor
  permission: push
  include:
  - actions-demo
  - another-repo
# You can include a list of repos for this collaborator and only those repos would have this collaborator

# See https://developer.github.com/v3/teams/#add-or-update-team-repository for available options
teams:
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

branches:
  # If the name of the branch is default, it will create a branch protection for the default branch in the repo
  - name: default
    # https://developer.github.com/v3/repos/branches/#update-branch-protection
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
        
validator:
  #pattern: '[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+.*' 
  pattern: '[a-zA-Z0-9_-]+'
```

**.github/repos/*.yml:** These files are for repo settings. Each file is for a specific repo. The file can have the following sections: 

1. The `repository`section contains the settings for that specific repository.
1. The rest of the sections could be `labels`,`collaborators`, `teams`, `branches`, `Validator` and they would be applied to that specific repo only.

```yaml
repository:
  # See https://developer.github.com/v3/repos/#edit for all available settings for a repository
    name: new-repo
    
    # The Organization the repo belongs to
    org: github
    
    # A short description of the repository that will show up on GitHub
    description: description of the repo
  
    # A URL with more information about the repository
    homepage: https://example.github.io/
    
    # Keep this as true for most cases
    # A lot of the policies below cannot be implemented on bare repos
    auto_init: true
    
    # A comma-separated list of topics to set on the repository
    topics: github, probot, new-topic, another-topic, topic-12
  
    # Either `true` to make the repository private, or `false` to make it public. 
    private: false
  
    # Either `true` to enable issues for this repository, `false` to disable them.
    has_issues: true
  
    # Either `true` to enable projects for this repository, or `false` to disable them.
    # If projects are disabled for the organization, passing `true` will cause an API error.
    has_projects: true
  
    # Either `true` to enable the wiki for this repository, `false` to disable it.
    has_wiki: true
  
    # Either `true` to enable downloads for this repository, `false` to disable them.
    has_downloads: true
  
    # Updates the default branch for this repository.
    default_branch: main-enterprise
  
    # Either `true` to allow squash-merging pull requests, or `false` to prevent
    # squash-merging.
    allow_squash_merge: true
  
    # Either `true` to allow merging pull requests with a merge commit, or `false`
    # to prevent merging pull requests with merge commits.
    allow_merge_commit: true
  
    # Either `true` to allow rebase-merging pull requests, or `false` to prevent
    # rebase-merging.
    allow_rebase_merge: true

# The following attributes are applied to any repo within the org
# So if a repo is not listed above is created or edited
# The app will apply the following settings to it
labels:
  # Labels: define labels for Issues and Pull Requests
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

collaborators:
# Collaborators: give specific users access to any repository.
# See https://developer.github.com/v3/repos/collaborators/#add-user-as-a-collaborator for available options

- username: regpaco
  permission: push
# The permission to grant the collaborator. Can be one of:
# * `pull` - can pull, but not push to or administer this repository.
# * `push` - can pull and push, but not administer this repository.
# * `admin` - can pull, push and administer this repository.
- username: beetlejuice
  permission: pull
  exclude:
  - actions-demo
# You can exclude a list of repos for this collaborator and all repos except these repos would have this collaborator
- username: thor
  permission: push
  include:
  - actions-demo
  - another-repo
# You can include a list of repos for this collaborator and only those repos would have this collaborator

# See https://developer.github.com/v3/teams/#add-or-update-team-repository for available options
teams:
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

branches:
  # If the name of the branch is default, it will create a branch protection for the default branch in the repo
  - name: default
    # https://developer.github.com/v3/repos/branches/#update-branch-protection
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
        
validator:
  #pattern: '[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+.*' 
  pattern: '[a-zA-Z0-9_-]+'
```

### Runtime Settings 

1. Besides the above settings files, the application can be bootstrapped with `runtime` settings.
2. The `runtime` settings are configured in `deployment-settings.yml` that is in the directory from where the GitHub app is running.
3. Currently the only setting that is possible are `restrictedRepos: [... ]` which allows you to configure a list of repos within your `org` that are excluded from the settings. If the `deployment-settings.yml` is not present, the following repos are added by default to the `restricted`repos list: `'admin', '.github', 'safe-settings'`

### Notes

1. Label color can also start with `#`, e.g. `color: '#F341B2'`. Make sure to wrap it with quotes!
1. Each top-level element under branch protection must be filled (eg: `required_pull_request_reviews`, `required_status_checks`, `enforce_admins` and `restrictions`). If you don't want to use one of them you must set it to `null` (see comments in the example above). Otherwise, none of the settings will be applied.

### Inheritance (there is none)

This app __DOES NOT USE__ [probot-config](https://github.com/probot/probot-config). This probot will only use the `.github/settings.yml` in the `admin` repo. This means with the 'safe-settings' probot you cannot inherit settings from another repo, nor can you override the settings.

## Security Implications (much better)

:+1: Note that this app is protected against _privilege escalation_. Unlike the original settings probot, this does not allow users with `write` permissions on a repo to override the settings. Which means anyone with _push_ permissions _cannot_ elevate themselves to the admin role; only users with `write` permissions on the `admin` repo could make changes to the permissions.

Within the `admin` repo, you can also increase the oversight by utilizing  the [GitHub CodeOwners feature](https://help.github.com/articles/about-codeowners/) to set one or more administrative users as the code owner of the `.github/settings.yml` file, and turn on "require code owner review" for the master branch. This does have the side effect of requiring code owner review for the entire branch, but helps preserve permission levels.

## Deployment

See [docs/deploy.md](docs/deploy.md) if you would like to run your own instance of this plugin.

## License

`safe-settings` is licensed under the [ISC license](https://github.com/github/safe-settings/blob/master/LICENSE)

`safe-settings` uses 3rd party libraries, each with their own license. These are found [here](https://github.com/github/safe-settings/blob/master/NOTICE.md).


[dependabot-link]: https://dependabot.com/

[dependabot-badge]: https://badgen.net/dependabot/probot/settings/?icon=dependabot

[github-actions-ci-link]: https://github.com/probot/settings/actions?query=workflow%3A%22Node.js+CI%22+branch%3Amaster

[github-actions-ci-badge]: https://github.com/probot/settings/workflows/Node.js%20CI/badge.svg
