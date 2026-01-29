# Agent Handbook

## Aha! Develop extensions at a glance

- Aha! extensions are lightweight bundles of TypeScript/React code that run inside the Aha! Develop UI and interact with product data through the global `aha` SDK.
- Each extension advertises contribution points (views, actions, settings) in `package.json` under `ahaExtension`. Aha! loads the defined entry points and injects the active record plus user-configured settings.
- Runtime APIs come from the Aha! host: data models (`aha.models.*`), authentication helpers (`aha.auth`), UI primitives (`aha-button`, `aha-alert`, etc.), and extension fields for persisting metadata on records.
- Extensions are delivered as gzipped bundles produced by `aha extension:build` and distributed via an installable URL. During development, `aha extension:watch` hot-reloads changes into a linked Aha! account.

## What this extension does

- Adds a custom attribute view titled "Claude Code" to Feature and Requirement records, surfaced from `assignClaudeButton` in `package.json`.
- Renders `src/views/AssignClaudeButton.tsx`, a React component that lets users send the current record to GitHub and mention Claude.
- Builds a GitHub issue payload via `src/lib/buildIssue.ts`, fetching enriched record details (description, requirements, tasks) and composing a structured markdown brief plus a mandatory branch/PR naming comment for the agent.
- Uses `src/lib/github.ts` to request a GitHub OAuth token through `aha.auth`, create the issue, and add the comment with Claude instructions.
- Stores the resulting issue metadata in an extension field (`claudeIssue`) so the UI can show existing assignments and offer a "View Issue" link.

## Settings expected from Aha!

- `repository` (required): owner/repo string used to target the GitHub project.
- `baseBranch`: default PR base (`main` if omitted).
- `claudeHandle`: optional handle override when constructing the comment (defaults to `claude`).
- `customInstructions`: extra markdown appended to the issue body.
- All settings are defined in `package.json` and can be scoped per account or user. Missing `repository` keeps the UI in a "Configure Claude" state.

## Key file map

- Entry view: [src/views/AssignClaudeButton.tsx](src/views/AssignClaudeButton.tsx)
- Issue builder: [src/lib/buildIssue.ts](src/lib/buildIssue.ts)
- GitHub REST helper: [src/lib/github.ts](src/lib/github.ts)
- Shared UI shell: [src/views/SendToAI.tsx](src/views/SendToAI.tsx)
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
- GitHub authentication uses the built-in OAuth app; the scope `repo, read:org` must be granted the first time.
- The repository string _must_ include `/`; invalid entries surface an inline error.
- Existing assignments load from the stored extension field, so deleting the field in Aha! resets the UI.
- TypeScript errors inside `.aha-cache` or generated view bundles can be ignored—they are artifacts of the CLI build process.

## When you update the extension

- Keep `package.json` `ahaExtension.contributes` in sync with new views or settings.
- Extension assets must remain self-contained; external network calls should respect user credentials (GitHub tokens already scoped per user).
- Re-run `aha extension:build` before publishing and update the install URL (see README instructions).

## Helpful references

- Aha! Develop Extension API docs: https://www.aha.io/support/develop/extensions
- aha-cli repository and release notes: https://github.com/aha-app/aha-cli
