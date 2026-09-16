import {
  branchCandidatesFor,
  branchNameFor,
} from "./prBootstrap";

describe("branchNameFor", () => {
  it("creates a branch from the Aha! reference and name", () => {
    expect(
      branchNameFor(
        "DEVOPS-3705",
        "Update Claude branch naming to match aha-dev-cli",
      ),
    ).toBe("DEVOPS-3705-update-claude-branch-naming-match-aha-dev-cli");
  });

  it("normalizes punctuation and removes stop words", () => {
    expect(branchNameFor("DEV-1", "Add a link to Aha!, now")).toBe(
      "DEV-1-add-link-aha-now",
    );
  });

  it("limits branch names to 80 characters", () => {
    expect(branchNameFor("DEV-1", "a".repeat(100))).toHaveLength(80);
  });
});

describe("branchCandidatesFor", () => {
  it("provides bounded suffixes for stale branches", () => {
    expect(branchCandidatesFor("DEV-1", "Do the work")).toEqual([
      "DEV-1-work",
      "DEV-1-work-2",
      "DEV-1-work-3",
      "DEV-1-work-4",
      "DEV-1-work-5",
    ]);
  });
});
