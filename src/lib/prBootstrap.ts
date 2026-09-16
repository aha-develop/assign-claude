// Keep this in sync with Git#dasherized_branch_name in aha-dev-cli.
const STOP_WORDS = new Set(
  [
    "a an the",
    "with at from into upon of to in for on onto by over under within but up out off above near",
    "be am is are was were been have has had do does did can could may might will would shall should must",
  ].flatMap((words) => words.split(" ")),
);

export function branchNameFor(referenceNum: string, name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^0-9A-Za-z-]/gi, " ")
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word));

  return [referenceNum, ...words].join("-").slice(0, 80);
}

const MAX_BRANCH_CANDIDATES = 5;

export function branchCandidatesFor(
  referenceNum: string,
  name: string,
): string[] {
  const base = branchNameFor(referenceNum, name);
  return Array.from({ length: MAX_BRANCH_CANDIDATES }, (_, index) =>
    index === 0 ? base : `${base}-${index + 1}`,
  );
}
