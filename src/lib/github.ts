import { GITHUB_API } from "./constants";
import { branchCandidatesFor } from "./prBootstrap";
import { TriggerMode } from "./types";

interface GitRef {
  object: { sha: string };
}

export interface GitPullRequest {
  html_url: string;
  number: number;
  base?: { ref: string };
}

interface GitHubWorkflowDispatch {
  workflow_run_id: number;
  run_url: string;
  html_url: string;
}

export interface BranchBootstrap {
  defaultBranch: string;
  baseBranch: string;
  branch: string;
  prNumber?: number;
  prUrl?: string;
}

export interface PullRequestBootstrap {
  baseBranch: string;
  branch: string;
  prNumber: number;
  prUrl: string;
}

export interface WorkflowDispatch {
  workflowRunId: number;
  runUrl: string;
  htmlUrl: string;
}

class GitHubRequestError extends Error {
  constructor(
    readonly status: number,
    message: string | undefined,
    endpoint: string,
  ) {
    super(describeError(status, message, endpoint));
    this.name = "GitHubRequestError";
  }
}

function describeError(
  status: number,
  message: string | undefined,
  endpoint: string,
): string {
  const base = message || `GitHub API error: ${status}`;
  if (status === 404 && endpoint.includes("/actions/workflows/")) {
    return `${base} - check that the workflow file exists on the repository's default branch and declares "on: workflow_dispatch".`;
  }
  if (status === 404 && endpoint.endsWith("/installation")) {
    return `${base} - install the configured GitHub App on this repository.`;
  }
  if (
    status === 422 &&
    endpoint.includes("/actions/workflows/") &&
    endpoint.endsWith("/dispatches")
  ) {
    return `${base} - check the workflow inputs: OAuth dispatch requires feature_reference, prompt, and pr_number; App dispatch requires feature_reference, prompt, branch, base_branch, title, and labels.`;
  }
  if (status === 422 && endpoint.endsWith("/labels")) {
    return `${base} - check that every configured pull request label exists in the repository.`;
  }
  return base;
}

export async function getGitHubToken(mode: TriggerMode): Promise<string> {
  const scope =
    mode === "workflow" ? "repo, read:org, workflow" : "repo, read:org";
  const authData = await aha.auth("github", {
    useCachedRetry: true,
    parameters: { scope },
  });
  return authData.token;
}

export async function commentOnPullRequest(
  token: string,
  options: { owner: string; repo: string; prNumber: number; comment: string },
): Promise<void> {
  const { owner, repo, prNumber, comment } = options;
  await restRequest(
    token,
    "POST",
    `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    { body: comment },
  );
}

export async function restRequest<T>(
  token: string,
  method: string,
  endpoint: string,
  body: unknown = null,
): Promise<T> {
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${GITHUB_API}${endpoint}`, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new GitHubRequestError(response.status, data.message, endpoint);
  }
  return data as T;
}

async function findRef(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<GitRef | null> {
  try {
    return await restRequest<GitRef>(
      token,
      "GET",
      `/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    );
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function findOpenPullRequest(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<GitPullRequest | null> {
  const pulls = await restRequest<GitPullRequest[]>(
    token,
    "GET",
    `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=1`,
  );
  return pulls[0] ?? null;
}

async function createEmptyCommit(
  token: string,
  owner: string,
  repo: string,
  baseSha: string,
  referenceNum: string,
): Promise<string> {
  const baseCommit = await restRequest<{ tree: { sha: string } }>(
    token,
    "GET",
    `/repos/${owner}/${repo}/git/commits/${baseSha}`,
  );
  const commit = await restRequest<{ sha: string }>(
    token,
    "POST",
    `/repos/${owner}/${repo}/git/commits`,
    {
      message: `${referenceNum || "NOREF"} Start Claude work [skip ci]`,
      tree: baseCommit.tree.sha,
      parents: [baseSha],
    },
  );
  return commit.sha;
}

async function applyLabels(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  labels: string[],
): Promise<void> {
  if (labels.length === 0) return;
  await restRequest(
    token,
    "POST",
    `/repos/${owner}/${repo}/issues/${prNumber}/labels`,
    { labels },
  );
}

export async function bootstrapPullRequest(
  token: string,
  options: {
    owner: string;
    repo: string;
    referenceNum: string;
    name: string;
    title: string;
    body: string;
    labels: string[];
  },
): Promise<PullRequestBootstrap> {
  const { owner, repo, referenceNum, name, title, body, labels } = options;
  const repoInfo = await restRequest<{ default_branch: string }>(
    token,
    "GET",
    `/repos/${owner}/${repo}`,
  );
  const baseBranch = repoInfo.default_branch;
  const baseRef = await restRequest<GitRef>(
    token,
    "GET",
    `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`,
  );
  const baseSha = baseRef.object.sha;
  const candidates = branchCandidatesFor(referenceNum, name);

  for (const branch of candidates) {
    const branchRef = await findRef(token, owner, repo, branch);
    if (branchRef) {
      const existingPr = await findOpenPullRequest(token, owner, repo, branch);
      if (existingPr) {
        await applyLabels(token, owner, repo, existingPr.number, labels);
        return {
          baseBranch,
          branch,
          prNumber: existingPr.number,
          prUrl: existingPr.html_url,
        };
      }
      if (branchRef.object.sha !== baseSha) {
        continue;
      }
    }

    const commitSha = await createEmptyCommit(
      token,
      owner,
      repo,
      baseSha,
      referenceNum,
    );
    if (branchRef) {
      await restRequest(
        token,
        "PATCH",
        `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
        { sha: commitSha },
      );
    } else {
      await restRequest(token, "POST", `/repos/${owner}/${repo}/git/refs`, {
        ref: `refs/heads/${branch}`,
        sha: commitSha,
      });
    }

    const pullRequest = await restRequest<GitPullRequest>(
      token,
      "POST",
      `/repos/${owner}/${repo}/pulls`,
      {
        title,
        head: branch,
        base: baseBranch,
        body: `Claude is working on this pull request. Treat it as in progress until Claude completes its work.\n\n${body}`,
        draft: true,
      },
    );
    await applyLabels(token, owner, repo, pullRequest.number, labels);
    return {
      baseBranch,
      branch,
      prNumber: pullRequest.number,
      prUrl: pullRequest.html_url,
    };
  }

  throw new Error(
    `${candidates[0]} and ${
      candidates.length - 1
    } suffixed variants have commits but no open pull request. Delete the stale branches in ${owner}/${repo} and try again.`,
  );
}

export async function bootstrapBranch(
  token: string,
  options: {
    owner: string;
    repo: string;
    referenceNum: string;
    name: string;
    previousBranch?: string;
  },
): Promise<BranchBootstrap> {
  const { owner, repo, referenceNum, name, previousBranch } = options;
  const repoInfo = await restRequest<{ default_branch: string }>(
    token,
    "GET",
    `/repos/${owner}/${repo}`,
  );
  const baseBranch = repoInfo.default_branch;
  const baseRef = await restRequest<GitRef>(
    token,
    "GET",
    `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`,
  );
  const baseSha = baseRef.object.sha;
  const candidates = Array.from(
    new Set([
      ...(previousBranch ? [previousBranch] : []),
      ...branchCandidatesFor(referenceNum, name),
    ]),
  );

  for (const branch of candidates) {
    const branchRef = await findRef(token, owner, repo, branch);
    if (branchRef) {
      const existingPr = await findOpenPullRequest(token, owner, repo, branch);
      if (existingPr) {
        return {
          defaultBranch: baseBranch,
          baseBranch: existingPr.base?.ref ?? baseBranch,
          branch,
          prNumber: existingPr.number,
          prUrl: existingPr.html_url,
        };
      }
      const pulls = await restRequest<GitPullRequest[]>(
        token,
        "GET",
        `/repos/${owner}/${repo}/pulls?state=closed&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=1`,
      );
      if (pulls.length > 0) continue;
      // A saved branch belongs to this assignment even if a failed run pushed
      // changes before it could open a PR. Never reset those changes on retry.
      if (branchRef.object.sha === baseSha || branch === previousBranch) {
        return { defaultBranch: baseBranch, baseBranch, branch };
      }
      continue;
    }

    try {
      await restRequest(token, "POST", `/repos/${owner}/${repo}/git/refs`, {
        ref: `refs/heads/${branch}`,
        sha: baseSha,
      });
    } catch (error) {
      // Another click may have created the same branch in the meantime.
      if (!(error instanceof GitHubRequestError && error.status === 422))
        throw error;
      const createdRef = await findRef(token, owner, repo, branch);
      if (!createdRef) throw error;
      if (createdRef.object.sha !== baseSha) continue;
    }
    return { defaultBranch: baseBranch, baseBranch, branch };
  }

  throw new Error(
    `${candidates[0]} and ${
      candidates.length - 1
    } suffixed variants are already used by other work. Delete the stale branches in ${owner}/${repo} and try again.`,
  );
}

export async function dispatchClaudeWorkflow(
  token: string,
  options: {
    owner: string;
    repo: string;
    workflowFile: string;
    ref: string;
    referenceNum: string;
    prompt: string;
  } & (
    | { prNumber: number }
    | {
        branch: string;
        baseBranch: string;
        title: string;
        labels: string[];
      }
  ),
): Promise<WorkflowDispatch> {
  const { owner, repo, workflowFile, ref, referenceNum, prompt } = options;
  const dispatch = await restRequest<GitHubWorkflowDispatch>(
    token,
    "POST",
    `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(
      workflowFile,
    )}/dispatches`,
    {
      ref,
      return_run_details: true,
      inputs: {
        feature_reference: referenceNum,
        prompt,
        ...("prNumber" in options
          ? { pr_number: String(options.prNumber) }
          : {
              branch: options.branch,
              base_branch: options.baseBranch,
              title: options.title,
              labels: JSON.stringify(options.labels),
            }),
      },
    },
  );
  return {
    workflowRunId: dispatch.workflow_run_id,
    runUrl: dispatch.run_url,
    htmlUrl: dispatch.html_url,
  };
}

export interface WorkflowRun {
  status: string;
  conclusion: string | null;
}

export async function getWorkflowRun(
  token: string,
  owner: string,
  repo: string,
  runId: number,
): Promise<WorkflowRun> {
  return restRequest(
    token,
    "GET",
    `/repos/${owner}/${repo}/actions/runs/${runId}`,
  );
}
