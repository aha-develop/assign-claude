export type TriggerMode = "mention" | "workflow";
export type GitHubAuthentication = "oauth" | "app";

export type RepositorySetting = string | string[];

export interface ClaudeSettings {
  repository?: RepositorySetting;
  triggerMode?: string;
  workflowFile?: string;
  pullRequestLabels?: string;
  customInstructions?: string;
  claudeHandle?: string;
  githubAppId?: string;
  githubAppPrivateKey?: string;
}

export function authenticationFor(
  settings: ClaudeSettings,
): GitHubAuthentication {
  return settings.githubAppId?.trim() ? "app" : "oauth";
}

export function triggerModeFor(settings: ClaudeSettings): TriggerMode {
  return settings.triggerMode === "workflow" ? "workflow" : "mention";
}

export function repositoriesFor(
  repository: RepositorySetting | undefined,
): string[] {
  if (!repository) return [];
  return Array.isArray(repository) ? repository : [repository];
}

export function preferredRepositoryFor(
  repositories: string[],
  preferredRepository: string | null,
): string | undefined {
  return preferredRepository && repositories.includes(preferredRepository)
    ? preferredRepository
    : repositories[0];
}

export interface LegacyClaudeIssueData {
  issueNumber: number;
  issueUrl: string;
  assignedAt: string;
  mode?: undefined;
}

export interface MentionIssueAssignmentData {
  mode: "mention";
  issueNumber: number;
  issueUrl: string;
  assignedAt: string;
}

export interface MentionPullRequestAssignmentData {
  mode: "mention";
  repository?: string;
  prNumber: number;
  prUrl: string;
  branch: string;
  assignedAt: string;
  lastTriggeredAt: string;
}

export interface WorkflowAssignmentData {
  mode: "workflow";
  repository?: string;
  prNumber?: number;
  prUrl?: string;
  branch: string;
  assignedAt: string;
  lastTriggeredAt: string;
  workflowRunId?: number;
  workflowRunUrl?: string;
  workflowStatus?: string;
  workflowConclusion?: string | null;
}

export type ClaudeAssignmentData =
  | LegacyClaudeIssueData
  | MentionIssueAssignmentData
  | MentionPullRequestAssignmentData
  | WorkflowAssignmentData;

export interface StoredClaudeAssignments {
  version: 2;
  mention?: MentionIssueAssignmentData | MentionPullRequestAssignmentData;
  workflow?: WorkflowAssignmentData;
  githubApp?: WorkflowAssignmentData;
}

export type StoredClaudeData = ClaudeAssignmentData | StoredClaudeAssignments;

function isStoredClaudeAssignments(
  stored: StoredClaudeData,
): stored is StoredClaudeAssignments {
  return "version" in stored && stored.version === 2;
}

export function assignmentMode(assignment: ClaudeAssignmentData): TriggerMode {
  return assignment.mode === "workflow" ? "workflow" : "mention";
}

export function isPullRequestAssignment(
  assignment: ClaudeAssignmentData,
): assignment is
  | MentionPullRequestAssignmentData
  | (WorkflowAssignmentData & {
      prNumber: number;
      prUrl: string;
    }) {
  return (
    "prNumber" in assignment && !!assignment.prNumber && !!assignment.prUrl
  );
}

export function isWorkflowAssignment(
  assignment: ClaudeAssignmentData,
): assignment is WorkflowAssignmentData {
  return "branch" in assignment && assignment.mode === "workflow";
}

export function repositoryForAssignment(
  assignment: ClaudeAssignmentData,
): string | undefined {
  if ("repository" in assignment && assignment.repository?.trim()) {
    return assignment.repository.trim();
  }

  const assignmentUrl = isPullRequestAssignment(assignment)
    ? assignment.prUrl
    : "issueUrl" in assignment
      ? assignment.issueUrl
      : "";

  try {
    // Also runs on Aha!'s server, which does not provide the browser URL API.
    const match = assignmentUrl.match(
      /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\//i,
    );
    return match
      ? `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`
      : undefined;
  } catch {
    return undefined;
  }
}

export function assignmentForMode(
  stored: StoredClaudeData | undefined,
  mode: TriggerMode,
  authentication: GitHubAuthentication = "oauth",
): ClaudeAssignmentData | undefined {
  if (!stored) return undefined;
  if (isStoredClaudeAssignments(stored)) {
    if (authentication === "app")
      return mode === "workflow" ? stored.githubApp : undefined;
    return stored[mode];
  }
  if (authentication === "app") return undefined;
  return assignmentMode(stored) === mode ? stored : undefined;
}

export function storeAssignment(
  stored: StoredClaudeData | undefined,
  assignment: MentionPullRequestAssignmentData | WorkflowAssignmentData,
  authentication: GitHubAuthentication = "oauth",
): StoredClaudeAssignments {
  let current: StoredClaudeAssignments;
  if (stored && isStoredClaudeAssignments(stored)) {
    current = stored;
  } else {
    current = { version: 2 };
    const previousAssignment =
      stored && !isStoredClaudeAssignments(stored) ? stored : undefined;
    if (previousAssignment && "issueNumber" in previousAssignment) {
      current.mention = {
        mode: "mention",
        issueNumber: previousAssignment.issueNumber,
        issueUrl: previousAssignment.issueUrl,
        assignedAt: previousAssignment.assignedAt,
      };
    } else if (
      previousAssignment &&
      "branch" in previousAssignment &&
      previousAssignment.mode === "mention"
    ) {
      current.mention = previousAssignment;
    } else if (previousAssignment && isWorkflowAssignment(previousAssignment)) {
      current.workflow = previousAssignment;
    }
  }

  if (authentication === "app" && isWorkflowAssignment(assignment)) {
    return { ...current, githubApp: assignment };
  }
  if (assignment.mode === "mention") {
    return { ...current, mention: assignment };
  }
  return { ...current, workflow: assignment };
}

export function parsePullRequestLabels(raw: string | undefined): string[] {
  const labels = (raw ?? "")
    .split(/\r?\n/)
    .map((label) => label.trim())
    .filter(Boolean);

  return labels.filter((label, index) => labels.indexOf(label) === index);
}
