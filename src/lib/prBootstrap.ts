function slugify(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

export function branchNameFor(referenceNum: string): string {
  const slug = slugify(referenceNum);
  return slug || "claude-work";
}

const MAX_BRANCH_CANDIDATES = 5;

export function branchCandidatesFor(referenceNum: string): string[] {
  const base = branchNameFor(referenceNum);
  return Array.from({ length: MAX_BRANCH_CANDIDATES }, (_, index) =>
    index === 0 ? base : `${base}-${index + 1}`,
  );
}
