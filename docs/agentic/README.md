# Agentic Config Normalization

This area documents an agentic addition to safe-settings aimed at helping
organizations **consolidate and normalize** duplication across their
`settings.yml`, `repos/*.yml`, and `suborgs/*.yml` configs.

Two example patterns motivate this work:

1. A team is granted access directly in a **repo** config, even though the
   repo already belongs to a **suborg** (via `suborgrepos`/`suborgteams`/
   `suborgproperties`) that could just declare the team once, at the suborg
   level.
2. The same **ruleset** (or other property) — with identical rules/properties
   — is independently defined, under different names, in multiple suborgs. It
   could instead be defined once at the **org** level and inherited by every
   suborg/repo.

Both patterns generalize: the same kind of duplication can occur for any
pluggable property safe-settings supports — teams, rulesets, branch
protection, labels, deployment environments, repository variables,
collaborators, autolinks, and custom properties (see
[`lib/plugins`](../../lib/plugins)).

This work ships as two independently-scoped features, each its own branch/PR
stacked on this design branch:

| Feature | What it does | Where it lives |
| --- | --- | --- |
| 1. Scheduled normalization workflow | A [GitHub Agentic Workflow](https://github.com/github/gh-aw) (`gh-aw`), run on a schedule, that scans an admin repo's configs, detects consolidation opportunities across **all** plugin types, and opens a PR proposing the change. | Template + docs an org admin installs into **their own** admin repo (safe-settings itself is tooling, not a specific org's admin repo). |
| 2. In-app Copilot SDK PR check | An advisory-only addition to safe-settings' existing PR dry-run check that flags consolidation opportunities in the configs a PR is adding/changing, plus a `/safe-settings consolidate` comment command that opens a follow-up PR on demand. | Ships as part of the safe-settings Probot app itself (`index.js`, `lib/`). |

## Why two features instead of one

- Feature 1 runs **out-of-band**, proactively, across the *entire* set of
  configs on a schedule — good for catching drift that accumulates over time
  regardless of any single PR.
- Feature 2 runs **in-band**, at PR time, scoped to *only* what a given PR is
  changing — good for catching new duplication as it's introduced, with a
  human in the loop who can opt in to acting on it immediately via a comment.

They intentionally do not share a code library so each can be reviewed,
shipped, and rolled back independently. They do share the conventions below
so their behavior and output feel like one coherent feature to end users.

## Shared conventions

Both features MUST follow these conventions:

### 1. Safety guardrail: zero-diff requirement

Any PR either feature opens to consolidate configs must be **structural
only** — relocating or deduplicating a definition, never changing the
*effective*, merged settings applied to any repo. Because both features open
real PRs against an admin repo, the existing safe-settings PR dry-run check
(`check_run` / [`lib/plugins/diffable.js`](../../lib/plugins/diffable.js))
already runs automatically and is the acceptance gate: a correct
consolidation PR should produce **no behavioral changes** to what safe-settings
would apply. Reviewers should treat a non-empty dry-run diff on one of these
PRs as a sign the proposed consolidation was incorrect.

### 2. Labeling

PRs and issues opened by either feature should be labeled `agentic-normalization`
so they're easy to filter/audit across an org, in addition to any repo-specific
labels already in use.

### 3. PR body template

Proposed consolidation PRs should use this structure in the PR body:

```markdown
## Consolidation opportunity

**Pattern detected:** <short description, e.g. "team X duplicated across repo and suborg configs">

**Before:**
<snippet(s) of the duplicated/redundant config>

**After:**
<snippet(s) of the consolidated config>

**Why this is safe:** Explains why the effective/merged settings are
unchanged (zero-diff) — e.g. "Repo already matches suborg's `suborgrepos`
pattern, so moving the team declaration into the suborg config produces an
identical merged result."

_Opened automatically by safe-settings' agentic config normalization. Please
verify the dry-run check below shows no diff before merging._
```

### 4. Comment-command spec

Feature 2 listens for the exact phrase `/safe-settings consolidate` in a PR
comment (case-insensitive, may appear anywhere in the comment body) to trigger
opening a follow-up consolidation PR for previously-reported findings on that
PR. No other comment commands are defined by this work.

## Branch / PR stack

```
main-enterprise
 └─ kenan214/agentic-config-normalization        (this branch — design only)
     ├─ feature/gh-aw-scheduled-normalization     (Feature 1)
     └─ feature/copilot-sdk-pr-check              (Feature 2)
```

See the per-feature docs once those branches land:

- Feature 1: `docs/agentic/scheduled-normalization-workflow.md` (added on
  `feature/gh-aw-scheduled-normalization`)
- Feature 2: `docs/agentic/copilot-sdk-pr-check.md` (added on
  `feature/copilot-sdk-pr-check`)
