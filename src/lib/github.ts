import { GITHUB_API } from "./constants";
import { branchCandidatesFor } from "./prBootstrap";
import { TriggerMode } from "./types";

interface CommentResponse {
  id: number;
}

interface GitRef {
  object: { sha: string };
}

interface GitPullRequest {
  html_url: string;
  number: number;
}

export interface PullRequestBootstrap {
  baseBranch: string;
  branch: string;
  prNumber: number;
  prUrl: string;
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
  if (
    status === 422 &&
    endpoint.includes("/actions/workflows/") &&
    endpoint.endsWith("/dispatches")
  ) {
    return `${base} - check that feature_reference, prompt, and pr_number are declared as workflow_dispatch inputs.`;
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

async function restRequest<T>(
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

export async function commentOnPullRequest(
  token: string,
  options: {
    owner: string;
    repo: string;
    prNumber: number;
    comment: string;
  },
): Promise<void> {
  const { owner, repo, prNumber, comment } = options;
  await restRequest<CommentResponse>(
    token,
    "POST",
    `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    { body: comment },
  );
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

async function findOpenPullRequest(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<GitPullRequest | null> {
  const query = new URLSearchParams({
    state: "open",
    head: `${owner}:${branch}`,
    per_page: "1",
  });
  const pulls = await restRequest<GitPullRequest[]>(
    token,
    "GET",
    `/repos/${owner}/${repo}/pulls?${query.toString()}`,
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
      message: `${referenceNum || "NOREF"} Start Claude work`,
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
    title: string;
    body: string;
    labels: string[];
  },
): Promise<PullRequestBootstrap> {
  const { owner, repo, referenceNum, title, body, labels } = options;
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
  const candidates = branchCandidatesFor(referenceNum);

  for (const branch of candidates) {
    const branchRef = await findRef(token, owner, repo, branch);
    if (branchRef) {
      const existingPr = await findOpenPullRequest(
        token,
        owner,
        repo,
        branch,
      );
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

export async function dispatchClaudeWorkflow(
  token: string,
  options: {
    owner: string;
    repo: string;
    workflowFile: string;
    ref: string;
    referenceNum: string;
    prompt: string;
    prNumber: number;
  },
): Promise<void> {
  const {
    owner,
    repo,
    workflowFile,
    ref,
    referenceNum,
    prompt,
    prNumber,
  } = options;
  await restRequest(
    token,
    "POST",
    `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(
      workflowFile,
    )}/dispatches`,
    {
      ref,
      inputs: {
        feature_reference: referenceNum,
        prompt,
        pr_number: String(prNumber),
      },
    },
  );
}
