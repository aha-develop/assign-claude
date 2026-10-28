import { execFileSync } from "child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

const workflow = require("js-yaml").load(
  readFileSync(join(__dirname, "../../examples/claude.yml"), "utf8"),
);
const script = workflow.jobs.claude.steps.find(
  (step: any) => step.name === "Commit changes and open a draft pull request",
).run;
let directory: string;
let cwd: string;

function git(...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "assign-claude-workflow-"));
  cwd = directory;
  git("init", "--bare", "-b", "master", "remote.git");
  git("clone", join(directory, "remote.git"), "work");
  cwd = join(directory, "work");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  writeFileSync(join(cwd, "app.txt"), "base\n");
  git("add", "app.txt");
  git("commit", "-m", "Initial commit");
  git("push", "origin", "master");
  git("checkout", "-b", "DEV-42-work");
  git("push", "origin", "DEV-42-work");
  writeFileSync(
    join(directory, "gh"),
    `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.GH_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'api' && args[1].startsWith('users/')) console.log('123');
if (args[0] === 'pr' && args[1] === 'list') {
  if (process.env.GH_EXISTING || fs.existsSync(process.env.GH_CREATED)) console.log('43');
}
if (args[0] === 'pr' && args[1] === 'create') {
  fs.writeFileSync(process.env.GH_CREATED, fs.readFileSync(args[args.indexOf('--body-file') + 1]));
}
if (args[0] === 'api' && args.includes('--input')) {
  fs.writeFileSync(process.env.GH_LABELS, fs.readFileSync(0));
}
if (args[0] === 'pr' && args[1] === 'view') console.log('https://github.com/acme/app/pull/43');
`,
    { mode: 0o755 },
  );
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function run(existing = false): string[][] {
  execFileSync("bash", ["-e", "-o", "pipefail", "-c", script], {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      GH_TOKEN: "test-token",
      APP_SLUG: "aha-claude",
      BRANCH: "DEV-42-work",
      BASE_BRANCH: "master",
      FEATURE_REFERENCE: "DEV-42",
      PR_TITLE: "Work $(touch injected) `touch injected`",
      PR_BODY: "Task details\n\n$(touch injected)",
      PR_LABELS: '["needs-review","team-platform"]',
      GITHUB_REPOSITORY: "acme/app",
      GITHUB_STEP_SUMMARY: join(directory, "summary"),
      RUNNER_TEMP: directory,
      GH_LOG: join(directory, "calls"),
      GH_CREATED: join(directory, "created"),
      GH_LABELS: join(directory, "labels"),
      GH_EXISTING: existing ? "true" : "",
    },
  });
  return readFileSync(join(directory, "calls"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

it("creates no commit or PR when Claude made no changes", () => {
  const before = git("rev-parse", "HEAD");
  const calls = run();
  expect(git("rev-parse", "HEAD")).toBe(before);
  expect(calls.some((args) => args[0] === "pr")).toBe(false);
});

it("pushes real changes, opens a draft as the App, and preserves task text literally", () => {
  writeFileSync(join(cwd, "app.txt"), "implementation\n");
  const calls = run();
  expect(git("rev-parse", "origin/DEV-42-work")).toBe(git("rev-parse", "HEAD"));
  expect(git("show", "--format=%an <%ae>", "--no-patch")).toBe(
    "aha-claude[bot] <123+aha-claude[bot]@users.noreply.github.com>",
  );
  expect(
    calls.find((args) => args[0] === "pr" && args[1] === "create"),
  ).toContain("--draft");
  expect(readFileSync(join(directory, "created"), "utf8")).toBe(
    "Task details\n\n$(touch injected)",
  );
  expect(JSON.parse(readFileSync(join(directory, "labels"), "utf8"))).toEqual({
    labels: ["needs-review", "team-platform"],
  });
  expect(existsSync(join(cwd, "injected"))).toBe(false);
});

it("reuses an existing PR after pushing new changes", () => {
  writeFileSync(join(cwd, "app.txt"), "more work\n");
  const calls = run(true);
  expect(calls.some((args) => args[0] === "pr" && args[1] === "create")).toBe(
    false,
  );
  expect(calls.some((args) => args[1]?.endsWith("/issues/43/labels"))).toBe(
    true,
  );
});
