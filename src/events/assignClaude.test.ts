import {
  assignWork,
  AssignWorkRequestSchema,
  AssignWorkResultSchema,
} from "../lib/assignWork";

jest.mock("../lib/assignWork", () => ({
  ...jest.requireActual("../lib/assignWork"),
  assignWork: jest.fn(),
}));

const request = {
  action: "assign",
  record: { id: "42", typename: "Feature" },
  repository: "acme/app",
  task: {
    title: "DEV-42: Work",
    body: "Task details",
    referenceNum: "DEV-42",
    name: "Work",
  },
};

it("registers request and result validation with the Aha event handler", () => {
  const registerEventHandler = jest.fn();
  (globalThis as any).aha = { registerEventHandler };
  try {
    require("./assignClaude");
    expect(registerEventHandler).toHaveBeenCalledWith({
      extensionId: "aha-develop.assign-claude",
      eventName: "assignWork",
      schema: AssignWorkRequestSchema,
      resultSchema: AssignWorkResultSchema,
      handler: assignWork,
    });
  } finally {
    delete (globalThis as any).aha;
  }
});

it.each(["Feature", "Requirement"])("accepts assignment of a %s", (typename) => {
  expect(
    AssignWorkRequestSchema.safeParse({
      ...request,
      record: { ...request.record, typename },
    }).success,
  ).toBe(true);
});

it.each([
  null,
  { ...request, action: "delete" },
  { ...request, record: undefined },
  { ...request, record: { id: "", typename: "Feature" } },
  { ...request, record: { id: "42", typename: "Idea" } },
  { ...request, task: undefined },
  ...["title", "body", "referenceNum", "name"].flatMap((field) => [
    { ...request, task: { ...request.task, [field]: "" } },
    { ...request, task: { ...request.task, [field]: 42 } },
  ]),
])("rejects malformed assignment arguments: %j", (args) => {
  expect(AssignWorkRequestSchema.safeParse(args).success).toBe(false);
});

it("accepts refresh without task details or a repository", () => {
  expect(
    AssignWorkRequestSchema.parse({
      action: "refresh",
      record: request.record,
    }),
  ).toEqual({ action: "refresh", record: request.record });
});

const assignment = {
  mode: "workflow",
  branch: "DEV-42-work",
  assignedAt: "2026-10-28T00:00:00Z",
  lastTriggeredAt: "2026-10-28T00:00:00Z",
};

it("accepts an assignment before a PR or workflow run exists", () => {
  expect(AssignWorkResultSchema.parse({ assignment })).toEqual({ assignment });
});

it("preserves PR and run metadata, including a null conclusion", () => {
  const result = {
    assignment: {
      ...assignment,
      repository: "acme/app",
      prNumber: 42,
      prUrl: "https://github.com/acme/app/pull/42",
      workflowRunId: 1234,
      workflowRunUrl: "https://github.com/acme/app/actions/runs/1234",
      workflowStatus: "in_progress",
      workflowConclusion: null,
    },
  };
  expect(AssignWorkResultSchema.parse(result)).toEqual(result);
});

it.each([
  {},
  { assignment: { ...assignment, mode: "mention" } },
  { assignment: { ...assignment, branch: undefined } },
  { assignment: { ...assignment, workflowRunId: "1234" } },
])("rejects malformed results: %j", (result) => {
  expect(AssignWorkResultSchema.safeParse(result).success).toBe(false);
});
