import {
  authenticationFor,
  assignmentForMode,
  isPullRequestAssignment,
  parsePullRequestLabels,
  preferredRepositoryFor,
  repositoryForAssignment,
  repositoriesFor,
  storeAssignment,
  triggerModeFor,
} from "./types";

describe("authentication settings", () => {
  it("keeps OAuth as the installed default without requiring an App key", () => {
    const settings =
      require("../../package.json").ahaExtension.contributes.settings;
    expect(
      authenticationFor({ githubAppId: settings.githubAppId.default }),
    ).toBe("oauth");
    expect(triggerModeFor({ triggerMode: settings.triggerMode.default })).toBe(
      "mention",
    );
    expect(settings.githubAppPrivateKey.required).not.toBe(true);
    expect(settings.repository.scope).toContain("user");
  });

  it("defaults to OAuth mention mode without App configuration", () => {
    expect(authenticationFor({})).toBe("oauth");
    expect(authenticationFor({ githubAppId: "  " })).toBe("oauth");
    expect(triggerModeFor({})).toBe("mention");
    expect(triggerModeFor({ triggerMode: "workflow" })).toBe("workflow");
  });

  it("selects App authentication when its ID is configured, without reading a browser secret", () => {
    expect(authenticationFor({ githubAppId: "123456" })).toBe("app");
  });
});

describe("repositoriesFor", () => {
  it("wraps a legacy string setting in an array", () => {
    expect(repositoriesFor("acme/app")).toEqual(["acme/app"]);
  });

  it("preserves the current array setting", () => {
    expect(repositoriesFor(["acme/app", "acme/api"])).toEqual([
      "acme/app",
      "acme/api",
    ]);
  });

  it("returns an empty array when the setting is absent", () => {
    expect(repositoriesFor(undefined)).toEqual([]);
  });
});

describe("preferredRepositoryFor", () => {
  const repositories = ["acme/app", "acme/api"];

  it("uses a remembered repository that is still configured", () => {
    expect(preferredRepositoryFor(repositories, "acme/api")).toBe("acme/api");
  });

  it("falls back to the first repository when the remembered value is stale", () => {
    expect(preferredRepositoryFor(repositories, "other/app")).toBe("acme/app");
  });
});

describe("repositoryForAssignment", () => {
  it("uses a repository stored on newer assignments", () => {
    expect(
      repositoryForAssignment({
        mode: "mention",
        repository: " acme/api ",
        prNumber: 43,
        prUrl: "https://github.com/acme/app/pull/43",
        branch: "DEV-43",
        assignedAt: "2026-08-11T00:00:00.000Z",
        lastTriggeredAt: "2026-08-11T00:00:00.000Z",
      }),
    ).toBe("acme/api");
  });

  it("infers the repository from older pull request assignments", () => {
    expect(
      repositoryForAssignment({
        mode: "workflow",
        prNumber: 42,
        prUrl: "https://github.com/acme/app/pull/42",
        branch: "DEV-42",
        assignedAt: "2026-08-11T00:00:00.000Z",
        lastTriggeredAt: "2026-08-11T00:00:00.000Z",
      }),
    ).toBe("acme/app");
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

  it("keeps OAuth and App workflow assignments separate when switching authentication", () => {
    const oauth = {
      mode: "workflow" as const,
      prNumber: 42,
      prUrl: "https://github.com/acme/app/pull/42",
      branch: "oauth-work",
      assignedAt: "2026-08-11T00:00:00.000Z",
      lastTriggeredAt: "2026-08-11T00:00:00.000Z",
    };
    const app = {
      ...oauth,
      branch: "app-work",
      prNumber: undefined,
      prUrl: undefined,
    };
    const stored = storeAssignment(
      storeAssignment(undefined, oauth),
      app,
      "app",
    );
    expect(assignmentForMode(stored, "workflow")).toEqual(oauth);
    expect(assignmentForMode(stored, "workflow", "app")).toEqual(app);
    const updated = storeAssignment(stored, { ...oauth, workflowRunId: 5 });
    expect(assignmentForMode(updated, "workflow", "app")).toEqual(app);
    expect(assignmentForMode(updated, "workflow")).toMatchObject({
      branch: "oauth-work",
    });
  });

  it("reads a legacy assignment as mention mode", () => {
    expect(assignmentForMode(legacy, "mention")).toEqual(legacy);
    expect(assignmentForMode(legacy, "workflow")).toBeUndefined();
  });

  it("preserves a legacy issue when adding a workflow assignment", () => {
    const stored = storeAssignment(legacy, {
      mode: "workflow",
      prNumber: 42,
      prUrl: "https://github.com/acme/app/pull/42",
      branch: "DEV-42",
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
      branch: "DEV-43",
      assignedAt: "2026-08-11T00:00:00.000Z",
      lastTriggeredAt: "2026-08-11T00:00:00.000Z",
    });

    expect(assignmentForMode(stored, "mention")).toMatchObject({
      mode: "mention",
      prNumber: 43,
    });
  });

  it("stores a workflow assignment before its PR exists", () => {
    const assignment = {
      mode: "workflow" as const,
      repository: "acme/app",
      branch: "DEV-42",
      assignedAt: "2026-08-11T00:00:00.000Z",
      lastTriggeredAt: "2026-08-11T00:00:00.000Z",
      workflowRunId: 1234,
    };
    const stored = storeAssignment(undefined, assignment);
    expect(assignmentForMode(stored, "workflow")).toEqual(assignment);
    expect(isPullRequestAssignment(assignment)).toBe(false);
    expect(repositoryForAssignment(assignment)).toBe("acme/app");
  });

  it("preserves a single legacy mention PR when switching to workflows", () => {
    const mention = {
      mode: "mention" as const,
      prNumber: 43,
      prUrl: "https://github.com/acme/app/pull/43",
      branch: "DEV-43",
      assignedAt: "2026-08-11T00:00:00.000Z",
      lastTriggeredAt: "2026-08-11T00:00:00.000Z",
    };
    const stored = storeAssignment(mention, { ...mention, mode: "workflow" });
    expect(stored.mention).toEqual(mention);
    expect(stored.workflow?.prNumber).toBe(43);
  });
});
