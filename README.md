# Assign to Claude

This Aha! Develop extension sends Features and Requirements to Claude through
GitHub. Teams can choose between two trigger modes:

- **Mention mode** creates a draft pull request as the signed-in GitHub user,
  then comments with `@claude`. This remains the default trigger mode.
- **Workflow mode** creates the same kind of draft pull request, then dispatches
  a workflow such as `claude.yml`.

Both modes use the signed-in user's GitHub OAuth credentials by default.
Accounts can optionally configure a GitHub App instead, which lets Aha! users
without GitHub accounts send work to Claude. See
[GitHub App mode](#github-app-mode-optional).

We recommend using this extension with the
[GitHub Develop extension](https://github.com/aha-develop/github).

## Configuration

| Setting                            | Description                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub Repository**              | Target repository in `owner/repo` format.                                                                                                                                 |
| **Claude Trigger**                 | Mention `@claude` using the standard Claude workflow, or dispatch a compatible workflow. Defaults to mention mode. A configured GitHub App always uses workflow dispatch. |
| **Workflow File**                  | Compatible workflow in `.github/workflows` on the repository's default branch. Defaults to `claude.yml`.                                                                  |
| **Pull Request Labels**            | Labels applied to created pull requests, one per line. Labels must already exist in GitHub.                                                                               |
| **Claude Handle**                  | Handle mentioned on the pull request in mention mode. Defaults to `claude`.                                                                                               |
| **Custom Instructions for Claude** | Additional markdown appended to the task details in either mode.                                                                                                          |
| **GitHub App ID**                  | Optional. Leave empty to use GitHub OAuth.                                                                                                                                |
| **GitHub App Private Key**         | Optional PEM private key for the App, stored as an Aha! account secret.                                                                                                   |

Settings can be scoped per account, team, or user as defined in `package.json`.
GitHub App settings are account-level only.

## Mention mode

Mention mode posts a comment on the user-authored pull request asking the
configured Claude handle to implement the task described in its body. The
target workflow must listen for `issue_comment` events and treat comments on
pull requests as work on the existing PR.

## Workflow mode

Copy the [minimal public workflow template](examples/claude.yml) to
`.github/workflows/claude.yml` in the target repository and add an
`ANTHROPIC_API_KEY` repository secret. You can then extend the workflow with
project-specific setup and test steps.

Workflow mode discovers the repository's default branch, creates a
`<reference>-<record-name>` branch with an empty commit, and opens a draft pull
request from it against the default branch. It then dispatches the configured
workflow from the default branch with these inputs:

```yaml
on:
  workflow_dispatch:
    inputs:
      feature_reference:
        required: true
        type: string
      prompt:
        required: true
        type: string
      pr_number:
        type: string
```

The [example workflow](examples/claude.yml) also accepts the branch-based
inputs used by GitHub App mode, so one workflow file supports both.

## GitHub App mode (optional)

GitHub App mode authenticates as an App your organization owns rather than as
the individual user. Instead of creating a placeholder pull request up front,
the extension creates a `<reference>-<record-name>` branch and dispatches the
workflow. After Claude finishes, the workflow commits its changes and opens a
draft pull request as the App. If Claude made no changes, no pull request is
created.

To set it up:

1. [Create a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
   owned by your organization. It needs no webhook or callback URL. Grant
   repository permissions **Contents**, **Pull requests**, and **Actions**,
   all read and write.
2. Generate a private key for the App and install it on each target
   repository.
3. In the Aha! account extension settings, set **GitHub App ID** and paste the
   private key into **GitHub App Private Key**.
4. In each target repository, add the `CLAUDE_APP_PRIVATE_KEY` and
   `ANTHROPIC_API_KEY` Actions secrets and a `CLAUDE_APP_ID` Actions variable.
5. Copy [examples/claude.yml](examples/claude.yml) to
   `.github/workflows/claude.yml` on the default branch. If you already use
   workflow mode with an older template, update it, because App mode needs
   the new inputs.

When an App ID is set, every assignment on the account uses the App, whatever
**Claude Trigger** says. Clear the ID to go back to OAuth. App runs read
repository, workflow, and label settings at the account or team scope, so
user-level overrides of those settings don't apply. Use **Refresh** on the
record to pick up the pull request once the workflow opens it.

## Installing the extension

**Note:** You must be an account administrator to install an extension into an
Aha! Develop account.

Install the extension by clicking
[here](https://secure.aha.io/settings/account/extensions/install?url=https%3A%2F%2Fsecure.aha.io%2Fextensions%2Faha-develop.assign-claude.gz).

## Working on the extension

Install [`aha-cli`](https://github.com/aha-app/aha-cli):

```sh
npm install -g aha-cli
```

Clone the repository, install dependencies, then link and watch the extension:

```sh
npm install
aha extension:install
aha extension:watch
```

Run the unit tests:

```sh
npm test
```

## Building

Build the installable `.gz` bundle:

```sh
aha extension:build
```

The output can be uploaded to a GitHub release or another publicly accessible
URL. See the
[Aha! Develop Extension API](https://www.aha.io/support/develop/extensions)
for extension platform documentation.
