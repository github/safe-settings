# GitHub Settings

[![Node CI Workflow Status][github-actions-ci-badge]][github-actions-ci-link]
[![Dependabot][dependabot-badge]][dependabot-link]

This is a modified version of [Settings Probot](https://github.com/probot/settings) GitHub App. This differs from the original probot settings app in 2 key ways:
1. It does not use [probot-config](https://github.com/probot/probot-config). Instead, it reads the settings from `.github/settings.yml` file contained in the `admin` repo in the organization. The `admin` repo should be a restricted repository and contains the settings for all the repos within the organization.
1. It manages the settings for all the repositories in the organization. Repositories could be explicitly defined in the settings config, but the app also manages any repo that is created in the organization.

## Usage

1. __[Install the app](https://github.com/decyjphr-org/safe-settings)__.
1. Create an `admin` repo within your organization (the repository must be called `admin`).
1. Create a `.github/settings.yml` file in the `admin` repository. Changes to this file on the default branch will be synced to GitHub.

```yaml
# These settings are synced to GitHub by https://github.com/decyjphr-org/safe-settings

repositories: 
  # This is a list of repositories that need to be synced. 
  # If the repository is not listed in the settings.yml, it will still be synced once it is manually created. 

  # See https://developer.github.com/v3/repos/#edit for all available settings for a repository
  - name: new-repo
    
    # The Organization the repo belongs to
    org: decyjphr-org
    
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
    
  # This is another repo
  - name: another-repo
    # Keep this as true as branch protections will not be applied otherwise
    auto_init: true
    org: decyjphr-org
    # A short description of the repository that will show up on GitHub
    description: description of another repo
 
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
# Note: Only valid on organization-owned repositories.
# The permission to grant the collaborator. Can be one of:
# * `pull` - can pull, but not push to or administer this repository.
# * `push` - can pull and push, but not administer this repository.
# * `admin` - can pull, push and administer this repository.

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
        

```

### Notes

1. Label color can also start with `#`, e.g. `color: '#F341B2'`. Make sure to wrap it with quotes!
1. Each top-level element under branch protection must be filled (eg: `required_pull_request_reviews`, `required_status_checks`, `enforce_admins` and `restrictions`). If you don't want to use one of them you must set it to `null` (see comments in the example above). Otherwise, none of the settings will be applied.

### Inheritance (there is none)

This app __DOES NOT USE__ [probot-config](https://github.com/probot/probot-config). This probot will only use the `.github/settings.yml` in the `admin` repo. This means with the 'safe-settings' probot you cannot inherit settings from another repo, nor can you override the settings.


## Security Implications (much better)

:+1: Note that this app is protected against _privilege escalation_. Unlike the orginal settings probot, this does not allow users with `write` permissions on a repo to override the settings. Which means anyone with _push_ permissions _cannot_ elevate themselves to the admin role; only users with `write` permissions on the `admin` repo could make changes to the permissions. 

Within the `admin` repo, you can also increase the oversight by utilizing  the [GitHub CodeOwners feature](https://help.github.com/articles/about-codeowners/) to set one or more administrative users as the code owner of the `.github/settings.yml` file, and turn on "require code owner review" for the master branch. This does have the side effect of requiring code owner review for the entire branch, but helps preserve permission levels.

## Deployment

See [docs/deploy.md](docs/deploy.md) if you would like to run your own instance of this plugin.

[dependabot-link]: https://dependabot.com/

[dependabot-badge]: https://badgen.net/dependabot/probot/settings/?icon=dependabot

[github-actions-ci-link]: https://github.com/probot/settings/actions?query=workflow%3A%22Node.js+CI%22+branch%3Amaster

[github-actions-ci-badge]: https://github.com/probot/settings/workflows/Node.js%20CI/badge.svg
