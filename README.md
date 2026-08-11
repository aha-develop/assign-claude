# Assign to Claude

This Aha! Develop extension sends Features and Requirements to Claude through
GitHub. Teams can choose between two trigger modes:

- **Mention mode** creates a draft pull request as the signed-in GitHub user,
  then comments with `@claude`. This remains the default trigger mode.
- **Workflow mode** creates the same kind of draft pull request, then dispatches
  a workflow such as `claude.yml`.

Both modes apply configured labels before triggering Claude. Creating the pull
request as the triggering user lets GitHub enforce its normal rule that pull
request authors cannot approve their own work.

We recommend using this extension with the
[GitHub Develop extension](https://github.com/aha-develop/github).

## Configuration

| Setting | Description |
| --- | --- |
| **GitHub Repository** | Target repository in `owner/repo` format. |
| **Claude Trigger** | Mention `@claude` in an issue, or dispatch a GitHub workflow. Defaults to mention mode. |
| **Claude Workflow File** | Workflow file dispatched in workflow mode. Defaults to `claude.yml`. |
| **Pull Request Labels** | Labels applied to created pull requests, one per line. Labels must already exist in GitHub. |
| **Claude Handle** | Handle mentioned on the pull request in mention mode. Defaults to `claude`. |
| **Custom Instructions for Claude** | Additional markdown appended to the task details in either mode. |

Settings can be scoped per account, team, or user as defined in `package.json`.

## Workflow mode

Workflow mode discovers the repository's default branch, creates a
`claude/<reference>` branch with an empty commit, and opens a draft pull request
from it against the default branch. It then dispatches the configured workflow
from the default branch with these inputs:

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
        required: false
        type: string
```

The extension always sends `pr_number`; declaring it as optional also allows
the workflow to support other trigger paths. The workflow should check it out
and make its changes on that existing pull request. The OAuth token remains in
the browser and is not passed as a workflow input.

Running Claude again in either mode reuses the existing open pull request and
reapplies the configured labels before triggering. If a previous pull request
was closed or merged without deleting its branch, the extension tries a bounded
sequence of suffixed branches such as `claude/DEV-123-2`.

## Mention mode

Mention mode posts a comment on the user-authored pull request asking the
configured Claude handle to implement the task described in its body. The
target workflow must listen for `issue_comment` events and treat comments on
pull requests as work on the existing PR.

Legacy issue assignments remain viewable. The UI offers to create a pull
request when an old issue-only assignment is encountered.

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
