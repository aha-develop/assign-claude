import { GITHUB_API } from "./constants";
import {
  bootstrapPullRequest,
  commentOnPullRequest,
  dispatchClaudeWorkflow,
} from "./github";

interface Route {
  method: string;
  path: string | RegExp;
  status?: number;
  body?: unknown;
}

interface Call {
  method: string;
  path: string;
  body: any;
}

function mockGitHub(routes: Route[]): Call[] {
  const calls: Call[] = [];
  jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url: URL | RequestInfo, options?: RequestInit) => {
      const path = String(url).replace(GITHUB_API, "");
      const method = options?.method ?? "GET";
      calls.push({
        method,
        path,
        body: options?.body ? JSON.parse(String(options.body)) : undefined,
      });
      const route = routes.find(
        (candidate) =>
          candidate.method === method &&
          (typeof candidate.path === "string"
            ? candidate.path === path
            : candidate.path.test(path)),
      );
      const status = route?.status ?? (route ? 200 : 404);
      const body = route?.body ?? {
        message: `Unrouted ${method} ${path}`,
      };
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => (status === 204 ? "" : JSON.stringify(body)),
      } as Response;
    });
  return calls;
}

const repositoryRoute: Route = {
  method: "GET",
  path: "/repos/acme/app",
  body: { default_branch: "master" },
};

const baseRefRoute: Route = {
  method: "GET",
  path: "/repos/acme/app/git/ref/heads/master",
  body: { object: { sha: "base-sha" } },
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe("bootstrapPullRequest", () => {
  it("reuses an open PR and applies all configured labels", async () => {
    const calls = mockGitHub([
      repositoryRoute,
      baseRefRoute,
      {
        method: "GET",
        path: "/repos/acme/app/git/ref/heads/DEV-42",
        body: { object: { sha: "work-sha" } },
      },
      {
        method: "GET",
        path: /\/pulls\?/,
        body: [
          {
            number: 42,
            html_url: "https://github.com/acme/app/pull/42",
          },
        ],
      },
      {
        method: "POST",
        path: "/repos/acme/app/issues/42/labels",
        body: {},
      },
    ]);

    await expect(
      bootstrapPullRequest("token", {
        owner: "acme",
        repo: "app",
        referenceNum: "DEV-42",
        title: "DEV-42: Do the work",
        body: "Task details",
        labels: ["needs-review", "team-platform"],
      }),
    ).resolves.toEqual({
      baseBranch: "master",
      branch: "DEV-42",
      prNumber: 42,
      prUrl: "https://github.com/acme/app/pull/42",
    });

    expect(
      calls.find(({ path }) => path.endsWith("/labels"))?.body,
    ).toEqual({
      labels: ["needs-review", "team-platform"],
    });
  });

  it("creates an empty commit, branch, and draft PR", async () => {
    const calls = mockGitHub([
      repositoryRoute,
      baseRefRoute,
      {
        method: "GET",
        path: "/repos/acme/app/git/ref/heads/DEV-42",
        status: 404,
        body: { message: "Not Found" },
      },
      {
        method: "GET",
        path: "/repos/acme/app/git/commits/base-sha",
        body: { tree: { sha: "base-tree" } },
      },
      {
        method: "POST",
        path: "/repos/acme/app/git/commits",
        status: 201,
        body: { sha: "empty-commit-sha" },
      },
      {
        method: "POST",
        path: "/repos/acme/app/git/refs",
        status: 201,
        body: {},
      },
      {
        method: "POST",
        path: "/repos/acme/app/pulls",
        status: 201,
        body: {
          number: 43,
          html_url: "https://github.com/acme/app/pull/43",
        },
      },
    ]);

    await bootstrapPullRequest("token", {
      owner: "acme",
      repo: "app",
      referenceNum: "DEV-42",
      title: "DEV-42: Do the work",
      body: "Task details",
      labels: [],
    });

    expect(
      calls.find(({ path }) => path.endsWith("/git/commits"))?.body,
    ).toMatchObject({
      tree: "base-tree",
      parents: ["base-sha"],
    });
    expect(calls.find(({ path }) => path.endsWith("/pulls"))?.body).toMatchObject(
      {
        head: "DEV-42",
        base: "master",
        draft: true,
      },
    );
  });
});

describe("dispatchClaudeWorkflow", () => {
  it("returns the dispatched workflow run", async () => {
    const calls = mockGitHub([
      {
        method: "POST",
        path: "/repos/acme/app/actions/workflows/claude.yml/dispatches",
        body: {
          workflow_run_id: 1234,
          run_url: "https://api.github.com/repos/acme/app/actions/runs/1234",
          html_url: "https://github.com/acme/app/actions/runs/1234",
        },
      },
    ]);

    await expect(
      dispatchClaudeWorkflow("token", {
        owner: "acme",
        repo: "app",
        workflowFile: "claude.yml",
        ref: "master",
        referenceNum: "DEV-42",
        prompt: "Task details",
        prNumber: 42,
      }),
    ).resolves.toEqual({
      workflowRunId: 1234,
      runUrl: "https://api.github.com/repos/acme/app/actions/runs/1234",
      htmlUrl: "https://github.com/acme/app/actions/runs/1234",
    });

    expect(calls[0].body).toEqual({
      ref: "master",
      return_run_details: true,
      inputs: {
        feature_reference: "DEV-42",
        prompt: "Task details",
        pr_number: "42",
      },
    });
  });
});

describe("commentOnPullRequest", () => {
  it("mentions Claude through the pull request issue-comment endpoint", async () => {
    const calls = mockGitHub([
      {
        method: "POST",
        path: "/repos/acme/app/issues/42/comments",
        status: 201,
        body: { id: 7 },
      },
    ]);

    await commentOnPullRequest("token", {
      owner: "acme",
      repo: "app",
      prNumber: 42,
      comment: "@claude implement this",
    });

    expect(calls[0].body).toEqual({ body: "@claude implement this" });
  });
});
