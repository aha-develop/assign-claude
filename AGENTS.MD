# Agent Handbook

## Aha! Develop extensions at a glance

- Aha! extensions are lightweight bundles of TypeScript/React code that run inside the Aha! Develop UI and interact with product data through the global `aha` SDK.
- Each extension advertises contribution points (views, actions, settings) in `package.json` under `ahaExtension`. Aha! loads the defined entry points and injects the active record plus user-configured settings.
- Runtime APIs come from the Aha! host: data models (`aha.models.*`), authentication helpers (`aha.auth`), UI primitives (`aha-button`, `aha-alert`, etc.), and extension fields for persisting metadata on records.
- Extensions are delivered as gzipped bundles produced by `aha extension:build` and distributed via an installable URL. During development, `aha extension:watch` hot-reloads changes into a linked Aha! account.

## What this extension does

- Adds a custom attribute view titled "Claude Code" to Feature and Requirement records, surfaced from `assignClaudeButton` in `package.json`.
- Renders `src/views/AssignClaudeButton.tsx`, a React component that supports issue-mention and workflow-dispatch modes.
- Builds the Claude task payload via `src/lib/buildIssue.ts`, fetching enriched record details (description, requirements, tasks) and composing a structured markdown brief plus the optional PR mention comment.
- Both modes create or reuse a user-authored draft PR and apply configured labels.
- In mention mode, uses `src/lib/github.ts` to comment on that PR with the configured Claude handle.
- In workflow mode, dispatches the configured workflow with the record prompt and PR number.
- Stores mode-specific issue and PR metadata in the `claudeIssue` extension field so assignments survive reloads and workflow runs can be triggered again.

## Settings expected from Aha!

- `repository` (required): owner/repo string used to target the GitHub project.
- `triggerMode`: `mention` (default) or `workflow`.
- `workflowFile`: workflow dispatched in workflow mode (defaults to `claude.yml`).
- `pullRequestLabels`: newline-separated labels applied to created PRs.
- `claudeHandle`: optional handle mentioned on the PR in mention mode (defaults to `claude`).
- `customInstructions`: extra markdown appended to the task details in either mode.
- All settings are defined in `package.json` and can be scoped per account, team, or user. Missing `repository` keeps the UI in a "Configure Claude" state.

## Key file map

- Entry view: [src/views/AssignClaudeButton.tsx](src/views/AssignClaudeButton.tsx)
- Issue builder: [src/lib/buildIssue.ts](src/lib/buildIssue.ts)
- GitHub REST helper: [src/lib/github.ts](src/lib/github.ts)
- Shared types and stored assignment migration: [src/lib/types.ts](src/lib/types.ts)
- PR branch naming: [src/lib/prBootstrap.ts](src/lib/prBootstrap.ts)
- Icon asset: [src/views/Icon.tsx](src/views/Icon.tsx)

## Working locally

1. Install the CLI once: `npm install -g aha-cli`.
2. Install dependencies if any are added (the repo is currently CLI-only).
3. Link the extension to an Aha! Develop account: `aha extension:install`.
4. Run a live dev loop: `aha extension:watch` (rebuilds on change, pushes to your account).
5. Build for distribution: `aha extension:build` (creates the `.gz` bundle in `.aha-cache`).

## Integration details & gotchas

- The view assumes the record implements `setExtensionField` and `getExtensionField`, which Aha! provides for Features and Requirements.
- `buildIssue` performs additional `aha.models.*` queries to enrich markdown. Ensure the current user has permission to read related objects.
- GitHub authentication uses the built-in OAuth app. Workflow mode also requests the `workflow` scope.
- The repository string _must_ include `/`; invalid entries surface an inline error.
- Workflow mode dispatches from the repository default branch and requires `feature_reference`, `prompt`, and `pr_number` workflow inputs.
- Configured PR labels must already exist in GitHub. They are reapplied when an open PR is reused.
- Existing legacy issue assignments remain viewable and can be moved to a pull request.
- TypeScript errors inside `.aha-cache` or generated view bundles can be ignored—they are artifacts of the CLI build process.

## When you update the extension

- Keep `package.json` `ahaExtension.contributes` in sync with new views or settings.
- Extension assets must remain self-contained; external network calls should respect user credentials (GitHub tokens already scoped per user).
- Re-run `aha extension:build` before publishing and update the install URL (see README instructions).

## Helpful references

- Aha! Develop Extension API docs: https://www.aha.io/support/develop/extensions
- aha-cli repository and release notes: https://github.com/aha-app/aha-cli
