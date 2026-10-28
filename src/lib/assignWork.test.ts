import { assignWork, AssignWorkRequest } from "./assignWork";
import {
  bootstrapBranch,
  dispatchClaudeWorkflow,
  findOpenPullRequest,
  getWorkflowRun,
} from "./github";
import { getInstallationToken } from "./githubApp";
import { StoredClaudeData } from "./types";

jest.mock("./github");
jest.mock("./githubApp");

let stored: StoredClaudeData | undefined;
const record = {
  teamId: "team-1",
  getExtensionField: jest.fn(async () => stored),
  setExtensionField: jest.fn(async (_extension, _field, value) => {
    stored = value;
  }),
};
const context = {
  settings: { githubAppId: "123456", githubAppPrivateKey: "private-key" },
  getSettings: jest.fn(async () => ({
    repository: ["acme/app"],
    pullRequestLabels: "needs-review",
  })),
} as unknown as Aha.Context;
const request: AssignWorkRequest = {
  action: "assign",
  record: { id: "42", typename: "Feature" },
  repository: "acme/app",
  task: {
    referenceNum: "DEV-42",
    name: "Work",
    title: "DEV-42: Work",
    body: "Task details",
  },
};
const dispatch = {
  workflowRunId: 1234,
  htmlUrl: "https://github.com/acme/app/actions/runs/1234",
  runUrl: "api-url",
};

beforeEach(() => {
  jest.clearAllMocks();
  stored = undefined;
  (globalThis as any).aha = {
    models: { Feature: { select: () => ({ find: async () => record }) } },
  };
  jest.mocked(getInstallationToken).mockResolvedValue("app-token");
  jest.mocked(bootstrapBranch).mockResolvedValue({
    defaultBranch: "master",
    baseBranch: "master",
    branch: "DEV-42-work",
  });
  jest.mocked(dispatchClaudeWorkflow).mockResolvedValue(dispatch);
  jest
    .mocked(getWorkflowRun)
    .mockResolvedValue({ status: "completed", conclusion: "success" });
  jest.mocked(findOpenPullRequest).mockResolvedValue(null);
});

afterEach(() => {
  delete (globalThis as any).aha;
});

it("persists the branch before dispatch, then saves the run without requiring a PR", async () => {
  jest.mocked(dispatchClaudeWorkflow).mockImplementation(async () => {
    expect(stored).toMatchObject({ githubApp: { branch: "DEV-42-work" } });
    return dispatch;
  });
  const result = await assignWork(request, context);
  expect(result.assignment).toMatchObject({
    branch: "DEV-42-work",
    workflowRunId: 1234,
  });
  expect(result.assignment.prNumber).toBeUndefined();
  expect(dispatchClaudeWorkflow).toHaveBeenCalledWith(
    "app-token",
    expect.objectContaining({
      ref: "master",
      baseBranch: "master",
      branch: "DEV-42-work",
      labels: ["needs-review"],
    }),
  );
  expect(JSON.stringify(result)).not.toMatch(/private-key|app-token/);
});

it("rejects repositories outside the team's configuration before minting credentials", async () => {
  await expect(
    assignWork({ ...request, repository: "other/private" }, context),
  ).rejects.toThrow("must be configured");
  expect(getInstallationToken).not.toHaveBeenCalled();
});

it("dispatches from the default branch when an existing PR targets another base", async () => {
  jest.mocked(bootstrapBranch).mockResolvedValue({
    defaultBranch: "master",
    baseBranch: "release",
    branch: "DEV-42-work",
    prNumber: 42,
    prUrl: "https://github.com/acme/app/pull/42",
  });
  await assignWork(request, context);
  expect(dispatchClaudeWorkflow).toHaveBeenCalledWith(
    "app-token",
    expect.objectContaining({
      ref: "master",
      baseBranch: "release",
    }),
  );
});

it("keeps a failed dispatch's branch for a retry", async () => {
  jest
    .mocked(dispatchClaudeWorkflow)
    .mockRejectedValueOnce(new Error("Dispatch failed"));
  await expect(assignWork(request, context)).rejects.toThrow("Dispatch failed");
  await assignWork(request, context);
  expect(bootstrapBranch).toHaveBeenLastCalledWith(
    "app-token",
    expect.objectContaining({ previousBranch: "DEV-42-work" }),
  );
});

it("does not dispatch another run while Claude is still running", async () => {
  await assignWork(request, context);
  jest.mocked(dispatchClaudeWorkflow).mockClear();
  jest
    .mocked(getWorkflowRun)
    .mockResolvedValue({ status: "in_progress", conclusion: null });
  await expect(assignWork(request, context)).rejects.toThrow(
    "already has a workflow running",
  );
  expect(dispatchClaudeWorkflow).not.toHaveBeenCalled();
});

it("returns the PR and run status on refresh without changing the saved assignment", async () => {
  await assignWork(request, context);
  jest.mocked(dispatchClaudeWorkflow).mockClear();
  record.setExtensionField.mockClear();
  jest.mocked(findOpenPullRequest).mockResolvedValue({
    number: 43,
    html_url: "https://github.com/acme/app/pull/43",
  });
  const result = await assignWork(
    { action: "refresh", record: request.record },
    context,
  );
  expect(result.assignment).toMatchObject({
    prNumber: 43,
    workflowStatus: "completed",
    workflowConclusion: "success",
  });
  expect(dispatchClaudeWorkflow).not.toHaveBeenCalled();
  expect(record.setExtensionField).not.toHaveBeenCalled();
});

it("keeps a run saved by dispatch while an earlier refresh is waiting for GitHub", async () => {
  stored = {
    version: 2,
    githubApp: {
      mode: "workflow",
      repository: "acme/app",
      branch: "DEV-42-work",
      assignedAt: "2026-10-26T22:35:52.335Z",
      lastTriggeredAt: "2026-10-26T22:35:52.335Z",
    },
  };
  jest.mocked(findOpenPullRequest).mockImplementationOnce(async () => {
    // Complete dispatch after refresh reads the branch-only assignment.
    await assignWork(request, context);
    return null;
  });

  await assignWork({ action: "refresh", record: request.record }, context);

  expect(stored).toMatchObject({
    githubApp: {
      workflowRunId: 1234,
      workflowRunUrl: dispatch.htmlUrl,
      workflowStatus: "queued",
    },
  });
});
