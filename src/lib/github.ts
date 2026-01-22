const GITHUB_API = "https://api.github.com";

interface IssueResponse {
  node_id: string;
  html_url: string;
  number: number;
}

interface CommentResponse {
  id: number;
  html_url: string;
}

interface CreateIssueOptions {
  owner: string;
  repo: string;
  title: string;
  body: string;
  comment: string;
}

export async function getGitHubToken(): Promise<string> {
  const authData = await aha.auth("github", {
    useCachedRetry: true,
    parameters: { scope: "repo, read:org" },
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
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `GitHub API error: ${response.status}`);
  }
  return data;
}

export async function createIssue(
  token: string,
  options: CreateIssueOptions,
): Promise<IssueResponse> {
  const { owner, repo, title, body, comment } = options;

  const issue = await restRequest<IssueResponse>(
    token,
    "POST",
    `/repos/${owner}/${repo}/issues`,
    {
      title,
      body,
    },
  );

  await restRequest<CommentResponse>(
    token,
    "POST",
    `/repos/${owner}/${repo}/issues/${issue.number}/comments`,
    {
      body: comment,
    },
  );
  return issue;
}
