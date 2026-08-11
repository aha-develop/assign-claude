import {
  branchCandidatesFor,
  branchNameFor,
} from "./prBootstrap";

describe("branchNameFor", () => {
  it("creates a Claude branch from the Aha! reference", () => {
    expect(branchNameFor("DEVOPS-3608")).toBe("claude/DEVOPS-3608");
  });

  it("removes characters that are unsafe in git refs", () => {
    expect(branchNameFor("A B/c~d")).toBe("claude/A-B-c-d");
  });

  it("falls back when the reference has no usable characters", () => {
    expect(branchNameFor("///")).toBe("claude/work");
  });
});

describe("branchCandidatesFor", () => {
  it("provides bounded suffixes for stale branches", () => {
    expect(branchCandidatesFor("DEV-1")).toEqual([
      "claude/DEV-1",
      "claude/DEV-1-2",
      "claude/DEV-1-3",
      "claude/DEV-1-4",
      "claude/DEV-1-5",
    ]);
  });
});
