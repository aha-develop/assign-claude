import {
  assignmentForMode,
  parsePullRequestLabels,
  storeAssignment,
  triggerModeFor,
} from "./types";

describe("triggerModeFor", () => {
  it("defaults existing installations to mention mode", () => {
    expect(triggerModeFor({ repository: "acme/app" })).toBe("mention");
  });

  it("accepts workflow mode", () => {
    expect(triggerModeFor({ triggerMode: "workflow" })).toBe("workflow");
  });
});

describe("parsePullRequestLabels", () => {
  it("parses, trims, and deduplicates newline-separated labels", () => {
    expect(
      parsePullRequestLabels("needs-review\n team-platform \nneeds-review"),
    ).toEqual(["needs-review", "team-platform"]);
  });
});

describe("stored assignments", () => {
  const legacy = {
    issueNumber: 12,
    issueUrl: "https://github.com/acme/app/issues/12",
    assignedAt: "2026-08-01T00:00:00.000Z",
  };

  it("reads a legacy assignment as mention mode", () => {
    expect(assignmentForMode(legacy, "mention")).toEqual(legacy);
    expect(assignmentForMode(legacy, "workflow")).toBeUndefined();
  });

  it("preserves a legacy issue when adding a workflow assignment", () => {
    const stored = storeAssignment(legacy, {
      mode: "workflow",
      prNumber: 42,
      prUrl: "https://github.com/acme/app/pull/42",
      branch: "claude/DEV-42",
      assignedAt: "2026-08-11T00:00:00.000Z",
      lastTriggeredAt: "2026-08-11T00:00:00.000Z",
      workflowRunId: 1234,
      workflowRunUrl: "https://github.com/acme/app/actions/runs/1234",
    });

    expect(stored.mention).toMatchObject({
      mode: "mention",
      issueNumber: 12,
    });
    expect(stored.workflow?.prNumber).toBe(42);
    expect(stored.workflow?.workflowRunUrl).toBe(
      "https://github.com/acme/app/actions/runs/1234",
    );
  });

  it("stores a mention-triggered pull request in mention mode", () => {
    const stored = storeAssignment(undefined, {
      mode: "mention",
      prNumber: 43,
      prUrl: "https://github.com/acme/app/pull/43",
      branch: "claude/DEV-43",
      assignedAt: "2026-08-11T00:00:00.000Z",
      lastTriggeredAt: "2026-08-11T00:00:00.000Z",
    });

    expect(assignmentForMode(stored, "mention")).toMatchObject({
      mode: "mention",
      prNumber: 43,
    });
  });
});
