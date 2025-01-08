# GitHub Safe-Settings

[![Create a release](https://github.com/github/safe-settings/actions/workflows/create-release.yml/badge.svg)](https://github.com/github/safe-settings/actions/workflows/create-release.yml)

`Safe-settings` – an app to manage policy-as-code and apply repository settings across an organization.

1. In `safe-settings`, all the settings are stored centrally in an `admin` repo within the organization. Unlike the [GitHub Repository Settings App](https://github.com/repository-settings/app), the settings files cannot be in individual repositories.

   > It is possible specify a custom repo instead of the `admin` repo with `ADMIN_REPO`. See [Environment variables](#environment-variables) for more details.

1. The **settings** in the **default** branch are applied. If the settings are changed on a non-default branch and a PR is created to merge the changes, the app runs in a `dry-run` mode to evaluate and validate the changes. Checks pass or fail based on the `dry-run` results.

1. In `safe-settings` the settings can have 2 types of targets:
   1. `org` - These settings are applied to the organization. `Org`-targeted settings are defined in `.github/settings.yml`. Currently, only `rulesets` are supported as `org`-targeted settings.
   1. `repo` - These settings are applied to repositories.

1. For the `repo`-targeted settings, there can be 3 levels at which the settings are managed:
   1. `Org`-level settings are defined in `.github/settings.yml`

      > It is possible to override this behavior and specify a different filename for the `settings.yml` file with `SETTINGS_FILE_PATH`. Similarly, the `.github` directory can be overridden with `CONFIG_PATH`. See [Environment variables](#environment-variables) for more details.

   1. `Suborg` level settings. A `suborg` is an arbitrary collection of repos belonging to projects, business units, or teams. The `suborg` settings reside in a yaml file for each `suborg` in the `.github/suborgs` folder.

      > In `safe-settings`, `suborgs` could be groups of repos based on `repo names`, or `teams` which the repos have collaborators from, or `custom property values` set for the repos

   1. `Repo` level settings. They reside in a repo specific yaml in `.github/repos` folder

1. It is recommended to break the settings into `org`-level, `suborg`-level, and `repo`-level units. This will allow different teams to define and manage policies for their specific projects or business units. With `CODEOWNERS`, this will allow different people to be responsible for approving changes in different projects.

> [!NOTE]
> The `suborg` and `repo` level settings directory structure cannot be customized.
>
> Settings files must have a `.yml` extension only. For now, the `.yaml` extension is ignored.


## How it works

`Safe-settings` is designed to run as a service listening for webhook events or as a scheduled job running on some regular cadence. It can also be triggered through GitHub Actions. (See the [How to use](#how-to-use) section for details on deploying and configuring.)


### Events
The App listens to the following webhook events:

- **push**: If the settings are created or modified, that is, if  push happens in the `default` branch of the `admin` repo and the file added or changed is `.github/settings.yml` or `.github/repos/*.yml`or `.github/suborgs/*.yml`, then the settings would be applied either globally to all the repos, or specific repos. For each repo, the settings that are actually applied depend on the default settings for the org, overlaid with settings for the suborg that the repo belongs to, overlaid with the settings for that specific repo.

- **repository.created**: If a repository is created in the org, the settings for the repo - the default settings for the org, overlaid with settings for the suborg that the repo belongs to, overlaid with the settings for that specific repo - is applied.

- **branch_protection_rule**: If a branch protection rule is modified or deleted, `safe-settings` will `sync` the settings to prevent any unauthorized changes.

- **repository.edited**: For e.g. If the default branch is renamed, or if topics change, `safe-settings` will `sync` the settings, to prevent any unauthorized changes.

- **repository.renamed**: If a repository is renamed, the default behavior is safe-settings will ignore this (for backward-compatibility). If `BLOCK_REPO_RENAME_BY_HUMAN` env variable is set to true, `safe-settings` will revert the repo to the previous name unless it is renamed using a `bot`. If it is renamed using a `bot`, it will try to copy the existing `<old-repo>.yml` to `<new-repo>.yml` so that the repo config yml stays consistent. If a <new-repo.yml> file already exists, it doesn't create a new one.

- **pull_request.opened**, **pull_request.reopened**, **check_suite.requested**: If the settings are changed, but it is not in the `default` branch, and there is an existing PR, the code will validate the settings changes by running safe-settings in `nop` mode and update the PR with the `dry-run` status.

- **repository_ruleset**: If the `ruleset` settings are modified in the UI manually, `safe-settings` will `sync` the settings to prevent any unauthorized changes.

- **member_change_events**: If a member is added or removed from a repository, `safe-settings` will `sync` the settings to prevent any unauthorized changes.

- **member**', __team.added_to_repository__, __team.removed_from_repository__, __team.edited__: `safe-settings` will `sync` the settings to prevent any unauthorized changes.

- __custom_property_values__: If new repository properties are set for a repository, `safe-settings` will run to so that if a sub-org config is defined by that property, it will be applied for the repo

### Use `safe-settings` to rename repos
If you rename a `<repo.yml>` that corresponds to a repo, safe-settings will rename the repo to the new name. This behavior will take effect whether the env variable `BLOCK_REPO_RENAME_BY_HUMAN` is set or not.

### Restricting `safe-settings` to specific repos
`safe-settings` can be turned on only to a subset of repos by specifying them in the runtime settings file, `deployment-settings.yml`. If no file is specified, then the following repositories -  `'admin', '.github', 'safe-settings'` are exempted by default.
A sample of `deployment-settings` file is found [here](docs/sample-settings/sample-deployment-settings.yml).

To apply `safe-settings` __only__ to a specific list of repos, add them to the `restrictedRepos` section as `include` array.

To ignore `safe-settings` for a specific list of repos, add them to the `restrictedRepos` section as `exclude` array.

> [!NOTE]
> The `include` and `exclude` attributes support as well regular expressions.
> By default they look for regex, Example include: ['SQL'] will look apply to repos with SQL and SQL_ and SQL- etc if you want only SQL repo then use include:['^SQL$']

### Custom rules

Admins setting up `safe-settings` can include custom rules that would be validated before applying a setting or overriding a broader scoped setting.

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

To periodically converge the settings to the configuration, set the `CRON` environment variable. See [Environment variables](#environment-variables) for more details.

### Pull Request Workflow
`Safe-settings` explicitly looks in the `admin` repo in the organization for the settings files. The `admin` repo could be a restricted repository with `branch protections` and `CODEOWNERS`

In that set up, when changes happen to the settings files and there is a PR for merging the changes back to the `default` branch in the `admin` repo, `safe-settings` will run `checks`  – which will run in **nop** mode and produce a report of the changes that would happen, including the API calls and the payload.

For e.g. If we have `override` validators that will fail if `org`-level branch protections are overridden at the repo or suborg level with a lesser number of required approvers, here is an screenshot of what users will see in the PR.
<p>
<img width="467" alt="image" src="https://github.com/github/safe-settings/assets/57544838/cc5d59fb-3d7c-477b-99e9-94bcafd07c0b">
</p>

> [!NOTE]
> If you don't want the PR message to have these details, they can be turned off with `CREATE_PR_COMMENT`. See [Environment variables](#environment-variables) for more details.

Here is a screenshot of what the users will see in the `checkrun` page:
<p>
<img width="462" alt="image" src="https://github.com/github/safe-settings/assets/57544838/c875224f-894b-45da-a9cc-4bfc75c47670">
</p>

### Error handling
The app creates a `Check` at the end of its processing to indicate if there were any errors. The `Check` is called `safe-settings` and corresponds to the latest commit on the `default` branch of the `admin` repo.

Here is an example of a `checkrun` result:
<p>
<img width="944" alt="image" src="https://github.com/github/safe-settings/assets/57544838/7ccedcea-628e-4055-a5a5-b8e45123777e">
</p>

And the `checkrun` page will look like this:
<p>
<img width="860" alt="image" src="https://github.com/github/safe-settings/assets/57544838/893ff4e6-904c-4a07-924a-7c23dc068983">
</p>

### The Settings Files

The settings files can be used to set the policies at the `org`, `suborg` or `repo` level.

The following can be configured:

- `Repository settings` - home page, url, visibility, has_issues, has_projects, wikis, etc.
- `Default branch` - naming and renaming
- `Topics`
- `Custom properties`
- `Teams and permissions`
- `Collaborators and permissions`
- `Issue labels`
- `Milestones`
- `Branch protections` - if the name of the branch is `default` in the settings, it is applied to the `default` branch of the repo.
- `Autolinks`
- `Repository name validation` using regex pattern
- `Rulesets`
- `Environments` - wait timer, required reviewers, prevent self review, protected branches deployment branch policy, custom deployment branch policy, variables, deployment protection rules

> [!important]
> It is possible to provide an `include` or `exclude` settings to restrict the `collaborators`, `teams`, `labels` to a list of repos or exclude a set of repos for a collaborator. 
> The include/exclude pattern can also be for glob. For e.g.:
```
teams:
  - name: Myteam-admins
    permission: admin
  - name: Myteam-developers
    permission: push
  - name: Other-team
    permission: push
    include:
      - '*-config'
```
> Will only add `Other-team` to only `*-config` repos

See [`docs/sample-settings/settings.yml`](docs/sample-settings/settings.yml) for a sample settings file.


### Additional values

In addition to the values in the file above, the settings file can have some additional values:

1. `force_create`: This is set in the repo-level settings to force create the repo if the repo does not exist.
2. `template`: This is set in the repo-level settings, and is used with the `force_create` flag to use a specific repo template when creating the repo
3. `suborgrepos`: This is set in the suborg-level settings to define an array of repos. This field can also take a `glob` pattern to allow wild-card expression to specify repos in a suborg. For e.g. `test*` would include `test`, `test1`, `testing`, etc.
4. The `suborgteams` section contains a list of teams, and all the repos belonging to the teams would be part of the `suborg`


### Environment variables

You can pass environment variables; the easiest way to do it is via a `.env` file.

1. `CRON` you can pass a cron input to run `safe-settings` at a regular schedule. This is based on [node-cron](https://www.npmjs.com/package/node-cron). For eg.
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
1. Logging level can be set using `LOG_LEVEL`. For e.g.
  ```
  LOG_LEVEL=trace
  ```
1. Configure the source repository using `ADMIN_REPO` (default is `admin`). For e.g.
  ```
  ADMIN_REPO=safe-settings-config
  ```
1. Configure the config path using `CONFIG_PATH` (default is `.github`). For e.g.
  ```
  CONFIG_PATH=.github
  ```
1. Configure the settings file path using `SETTINGS_FILE_PATH` (default is `settings.yml`). For e.g.
  ```
  SETTINGS_FILE_PATH=settings.yml
  ```
1. Configure the deployment settings file path using `DEPLOYMENT_CONFIG_FILE` (default is `deployment-settings.yml`). For e.g.
  ```
  DEPLOYMENT_CONFIG_FILE=deployment-settings.yml
  ```
1. Enable the pull request comment using `ENABLE_PR_COMMENT` (default is `true`). For e.g.
  ```
  ENABLE_PR_COMMENT=true
  ```
1. Block repository renaming manually using `BLOCK_REPO_RENAME_BY_HUMAN` (default is `false`). For e.g.
  ```
  BLOCK_REPO_RENAME_BY_HUMAN=true
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

1. Create an `admin` repo (or an alternative of your choosing) within your organization. Remember to set `ADMIN_REPO` if you choose something other than `admin`. See [Environment variables](#environment-variables) for more details.

2. Add the settings for the `org`, `suborgs`, and `repos`. Sample files can be found [here](docs/sample-settings).

3. __[Deploy and install the app](docs/deploy.md)__.  Alternatively, the __[GitHub Actions Guide](docs/github-action.md)__ describes how to run `safe-settings` with GitHub Actions.




## License

`safe-settings` is licensed under the [ISC license](https://github.com/github/safe-settings/blob/master/LICENSE)

`safe-settings` uses 3rd party libraries, each with their own license. These are found [here](https://github.com/github/safe-settings/blob/master/NOTICE.md).


[dependabot-link]: https://dependabot.com/

[dependabot-badge]: https://badgen.net/dependabot/probot/settings/?icon=dependabot

[github-actions-ci-link]: https://github.com/probot/settings/actions?query=workflow%3A%22Node.js+CI%22+branch%3Amaster

[github-actions-ci-badge]: https://github.com/probot/settings/workflows/Node.js%20CI/badge.svg
