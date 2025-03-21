## Status checks inheritance across scopes

### Rulesets

The status checks between organisation and repository rulesets are independent of each together.

In the following examples, a common ruleset name is used at all levels. Repo1 and Repo2 are managed at the Sub-org level.

#### No custom checks
```
Org checks:
  Org Check
Sub-org checks:
  Sub-org Check
Repo checks for Repo2:
  Repo Check
```

Status checks:
  - Newly deployed rules:
    - Org: Org Check
    - Repo1: Sub-org Check
    - Repo2: _Failed to deploy as required_status_checks can't be defined twice in both sub-org and repo level_
  - Updating status checks via GitHub UI:
    - Org: Status checks reverted back to safe settings
    - Repo1: Status checks reverted back to safe settings
    - Repo2: NA

#### No custom checks 2
```
Org checks:
  Org Check
Sub-org checks:
  Sub-org Check
Repo checks for Repo2:
  _NONE_
```

Status checks:
  - Newly deployed rules:
    - Org: Org Check
    - Repo1: Sub-org Check
    - Repo2: _NONE_
  - Updating status checks via GitHub UI:
    - Org: Status checks reverted back to safe settings
    - Repo1: Status checks reverted back to safe settings
    - Repo2: Custom status checks are retained

**The remaining tests will leave Repo2 out of the Sub-org.**

#### Custom checks enabled at the Org and Sub-org level
```
Org:
  Org Check
  {{EXTERNALLY_DEFINED}}
Sub-org checks:
  Sub-org Check
  {{EXTERNALLY_DEFINED}}
Repo checks for Repo2:
  Repo Check
```

Status checks:
  - Newly deployed rules:
    - Org: []
    - Repo1: []
    - Repo2: Repo Check
  - Updating status checks via GitHub UI:
    - Org: Custom status checks are retained
    - Repo1: Custom status checks are retained
    - Repo2: Status checks reverted back to safe settings

#### Custom checks enabled at the Repo level
```
Org:
  Org Check
Sub-org checks:
  Sub-org Check
Repo checks for Repo2:
  Repo Check
  {{EXTERNALLY_DEFINED}}
```

Status checks:
  - Newly deployed rules:
    - Org: Org Check
    - Repo1: Sub-org Check
    - Repo2: []
  - Updating status checks via GitHub UI:
    - Org: Status checks reverted back to safe settings
    - Repo1: Status checks reverted back to safe settings
    - Repo2: Custom status checks are retained


### Branch protection rules

In the following examples the `main` branch is protected at all levels. Repo1 and Repo2 are managed at the Sub-org level.

#### No custom checks
```
Org checks:
  Org Check
Sub-org checks:
  Sub-org Check
Repo checks for Repo2:
  Repo Check
```

Status checks:
  - Newly deployed rules:
    - Repo1: Org Check, Sub-org Check
    - Repo2: Org Check, Sub-org Check, Repo Check
  - Updating status checks via GitHub UI:
    - Repo1: Status checks reverted back to safe settings
    - Repo2: Status checks reverted back to safe settings

#### Custom checks enabled at the Org level
```
Org:
  Org Check
  {{EXTERNALLY_DEFINED}}
Sub-org checks:
  Sub-org Check
Repo checks for Repo2:
  Repo Check
```

Status checks:
  - Newly deployed rules:
    - Repo1: []
    - Repo2: []
  - Updating status checks via GitHub UI:
    - Repo1: Custom status checks are retained
    - Repo2: Custom status checks are retained

#### Custom checks enabled at the Sub-org level
```
Org:
  Org Check
Sub-org checks:
  Sub-org Check
  {{EXTERNALLY_DEFINED}}
Repo checks for Repo2:
  Repo Check
```

Status checks:
  - Newly deployed rules:
    - Repo1: []
    - Repo2: []
  - Updating status checks via GitHub UI:
    - Repo1: Custom status checks are retained
    - Repo2: Custom status checks are retained

#### Custom checks enabled at the Repo level
```
Org:
  Org Check
Sub-org checks:
  Sub-org Check
Repo checks for Repo2:
  Repo Check
  {{EXTERNALLY_DEFINED}}
```

Status checks:
  - Newly deployed rules:
    - Repo1: Org Check, Sub-org Check
    - Repo2: []
  - Updating status checks via GitHub UI:
    - Repo1: Status checks reverted back to safe settings
    - Repo2: Custom status checks are retained