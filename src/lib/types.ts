export type TriggerMode = "mention" | "workflow";

export interface ClaudeSettings {
  repository?: string;
  triggerMode?: string;
  workflowFile?: string;
  pullRequestLabels?: string;
  customInstructions?: string;
  claudeHandle?: string;
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
  prNumber: number;
  prUrl: string;
  branch: string;
  assignedAt: string;
  lastTriggeredAt: string;
}

export interface WorkflowAssignmentData {
  mode: "workflow";
  prNumber: number;
  prUrl: string;
  branch: string;
  assignedAt: string;
  lastTriggeredAt: string;
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
}

export type StoredClaudeData = ClaudeAssignmentData | StoredClaudeAssignments;

function isStoredClaudeAssignments(
  stored: StoredClaudeData,
): stored is StoredClaudeAssignments {
  return "version" in stored && stored.version === 2;
}

export function triggerModeFor(settings: ClaudeSettings): TriggerMode {
  return settings.triggerMode === "workflow" ? "workflow" : "mention";
}

export function assignmentMode(
  assignment: ClaudeAssignmentData,
): TriggerMode {
  return assignment.mode === "workflow" ? "workflow" : "mention";
}

export function isPullRequestAssignment(
  assignment: ClaudeAssignmentData,
): assignment is MentionPullRequestAssignmentData | WorkflowAssignmentData {
  return "prNumber" in assignment;
}

export function assignmentForMode(
  stored: StoredClaudeData | undefined,
  mode: TriggerMode,
): ClaudeAssignmentData | undefined {
  if (!stored) return undefined;
  if (isStoredClaudeAssignments(stored)) {
    return stored[mode];
  }
  return assignmentMode(stored) === mode ? stored : undefined;
}

export function storeAssignment(
  stored: StoredClaudeData | undefined,
  assignment: MentionPullRequestAssignmentData | WorkflowAssignmentData,
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
    }
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
