import { EXTENSION_ID, FIELD_NAME } from "./constants";
import {
  bootstrapBranch,
  dispatchClaudeWorkflow,
  findOpenPullRequest,
  getWorkflowRun,
} from "./github";
import { getInstallationToken } from "./githubApp";
import {
  assignmentForMode,
  ClaudeSettings,
  isWorkflowAssignment,
  parsePullRequestLabels,
  repositoriesFor,
  repositoryForAssignment,
  StoredClaudeData,
  storeAssignment,
  WorkflowAssignmentData,
} from "./types";

export interface AssignWorkRequest {
  action: "assign" | "refresh";
  record: { id: string; typename: "Feature" | "Requirement" };
  repository?: string;
  task?: { title: string; body: string; referenceNum: string; name: string };
}

export interface AssignWorkResult {
  assignment: WorkflowAssignmentData;
}

export async function assignWork(
  args: AssignWorkRequest,
  context: Aha.Context,
): Promise<AssignWorkResult> {
  if (
    !args.record?.id ||
    !["Feature", "Requirement"].includes(args.record.typename) ||
    !["assign", "refresh"].includes(args.action)
  ) {
    throw new Error(
      "A feature or requirement and a valid action are required.",
    );
  }
  const modelClass = aha.models[args.record.typename] as unknown as {
    select(...fields: string[]): {
      find(id: string): Promise<Aha.HasExtensionFields & { teamId: string }>;
    };
  };
  const record = await modelClass.select("teamId").find(args.record.id);
  if (!record?.teamId) throw new Error("Could not find the record's team.");
  const settings = (await context.getSettings({
    teamId: record.teamId,
  })) as ClaudeSettings;
  let stored = await record.getExtensionField<StoredClaudeData>(
    EXTENSION_ID,
    FIELD_NAME,
  );
  const previous =
    assignmentForMode(stored, "workflow", "app") ??
    assignmentForMode(stored, "workflow") ??
    assignmentForMode(stored, "mention");
  const repository =
    (previous && repositoryForAssignment(previous)) ?? args.repository;
  // Server events run as the installer. Authorize the selected repository
  // against the record's effective settings before using the App's shared identity.
  if (
    !repository ||
    !repositoriesFor(settings.repository).includes(repository)
  ) {
    throw new Error(
      "The repository must be configured for this record's team.",
    );
  }
  const parts = repository.split("/");
  if (
    parts.length !== 2 ||
    !parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part))
  ) {
    throw new Error("Configure the repository in owner/repo format.");
  }
  const [owner, repo] = parts;
  const token = await getInstallationToken({
    appId: String(context.settings.githubAppId ?? "").trim(),
    privateKey: String(context.settings.githubAppPrivateKey ?? ""),
    owner,
    repo,
  });
  const workflowAssignment =
    previous && isWorkflowAssignment(previous) ? previous : undefined;
  const run = workflowAssignment?.workflowRunId
    ? await getWorkflowRun(token, owner, repo, workflowAssignment.workflowRunId)
    : undefined;

  if (args.action === "refresh") {
    if (!workflowAssignment)
      throw new Error("Send this record to Claude first.");
    const pr = await findOpenPullRequest(
      token,
      owner,
      repo,
      workflowAssignment.branch,
    );
    const assignment = {
      ...workflowAssignment,
      ...(pr ? { prNumber: pr.number, prUrl: pr.html_url } : {}),
      workflowStatus: run?.status,
      workflowConclusion: run?.conclusion,
    };
    // Refresh can overlap dispatch; do not overwrite newer run metadata with
    // the assignment snapshot read before the GitHub requests completed.
    return { assignment };
  }

  if (run && run.status !== "completed") {
    throw new Error(
      "Claude already has a workflow running for this record. View the run or refresh its status.",
    );
  }
  if (
    !args.task ||
    ![
      args.task.title,
      args.task.body,
      args.task.referenceNum,
      args.task.name,
    ].every((value) => typeof value === "string" && value.length > 0)
  ) {
    throw new Error("The record's task details are required.");
  }
  const workflowFile = (settings.workflowFile ?? "claude.yml").trim();
  if (!workflowFile) throw new Error("Configure the Claude workflow file.");
  const branch = await bootstrapBranch(token, {
    owner,
    repo,
    referenceNum: args.task.referenceNum,
    name: args.task.name,
    previousBranch:
      previous && "branch" in previous ? previous.branch : undefined,
  });
  const now = new Date().toISOString();
  let assignment: WorkflowAssignmentData = {
    mode: "workflow",
    repository,
    branch: branch.branch,
    prNumber: branch.prNumber,
    prUrl: branch.prUrl,
    assignedAt: previous?.assignedAt ?? now,
    lastTriggeredAt: now,
  };
  // Persist the branch before dispatch so a failed trigger can resume it.
  stored = storeAssignment(stored, assignment, "app");
  await record.setExtensionField(EXTENSION_ID, FIELD_NAME, stored);
  const dispatch = await dispatchClaudeWorkflow(token, {
    owner,
    repo,
    workflowFile,
    ref: branch.defaultBranch,
    referenceNum: args.task.referenceNum,
    prompt: args.task.body,
    branch: branch.branch,
    baseBranch: branch.baseBranch,
    title: args.task.title,
    labels: parsePullRequestLabels(settings.pullRequestLabels),
  });
  assignment = {
    ...assignment,
    workflowRunId: dispatch.workflowRunId,
    workflowRunUrl: dispatch.htmlUrl,
    workflowStatus: "queued",
  };
  stored = storeAssignment(stored, assignment, "app");
  await record.setExtensionField(EXTENSION_ID, FIELD_NAME, stored);
  return { assignment };
}
