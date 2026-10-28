import { SendToAI } from "@aha-app/aha-develop-react";
import React, { useCallback, useEffect, useState } from "react";
import { buildIssue, RecordType } from "../lib/buildIssue";
import { EXTENSION_ID, FIELD_NAME } from "../lib/constants";
import type { AssignWorkResult } from "../lib/assignWork";
import {
  bootstrapPullRequest,
  commentOnPullRequest,
  dispatchClaudeWorkflow,
  getGitHubToken,
} from "../lib/github";
import {
  authenticationFor,
  assignmentForMode,
  ClaudeAssignmentData,
  ClaudeSettings,
  isPullRequestAssignment,
  isWorkflowAssignment,
  MentionPullRequestAssignmentData,
  parsePullRequestLabels,
  preferredRepositoryFor,
  repositoryForAssignment,
  repositoriesFor,
  StoredClaudeData,
  storeAssignment,
  triggerModeFor,
  WorkflowAssignmentData,
} from "../lib/types";
import { useTeamSettings } from "../lib/useTeamSettings";
import { Icon } from "./Icon";
import { RepositorySelect } from "./RepositorySelect";

const LAST_USED_REPOSITORY_KEY = `${EXTENSION_ID}.lastUsedRepository`;

type AssignClaudeButtonProps = {
  record: RecordType;
  settings: ClaudeSettings;
  existingAssignments?: StoredClaudeData;
};

type Status =
  "not-configured" | "idle" | "loading" | "success" | "error" | "existing";

function repositoryParts(repository: string | undefined): {
  owner: string;
  repo: string;
} {
  const parts = (repository ?? "")
    .trim()
    .split("/")
    .map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      "Please configure the repository setting in owner/repo format.",
    );
  }
  return { owner: parts[0], repo: parts[1] };
}

function lastUsedRepository(): string | null {
  try {
    return window.localStorage.getItem(LAST_USED_REPOSITORY_KEY);
  } catch {
    return null;
  }
}

function rememberRepository(repository: string): void {
  try {
    window.localStorage.setItem(LAST_USED_REPOSITORY_KEY, repository);
  } catch {
    // The selection still works when storage is unavailable.
  }
}

const AssignClaudeButton: React.FC<AssignClaudeButtonProps> = ({
  record,
  settings,
  existingAssignments,
}) => {
  const authentication = authenticationFor(settings);
  const mode = authentication === "app" ? "workflow" : triggerModeFor(settings);
  const matchingAssignment = assignmentForMode(
    existingAssignments,
    mode,
    authentication,
  );
  const repositories = repositoriesFor(settings.repository);
  const [rememberedRepository, setRememberedRepository] =
    useState(lastUsedRepository);
  const repository = preferredRepositoryFor(repositories, rememberedRepository);
  const hasSettings = !!repository;

  const handleRepositoryChange = useCallback((nextRepository: string) => {
    setRememberedRepository(nextRepository);
    rememberRepository(nextRepository);
  }, []);

  const [storedAssignments, setStoredAssignments] = useState<
    StoredClaudeData | undefined
  >(existingAssignments);
  const [assignment, setAssignment] = useState<
    ClaudeAssignmentData | undefined
  >(matchingAssignment);
  const [status, setStatus] = useState<Status>(
    matchingAssignment ? "existing" : hasSettings ? "idle" : "not-configured",
  );
  const [message, setMessage] = useState<string>(
    matchingAssignment ? "Assigned to Claude." : "",
  );

  const handleClick = useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault();
      setStatus("loading");
      setMessage("Loading record details...");

      try {
        const targetRepository = assignment
          ? (repositoryForAssignment(assignment) ?? repository)
          : repository;
        if (targetRepository) rememberRepository(targetRepository);

        const { title, body, comment, model } = await buildIssue({
          record,
          customInstructions:
            typeof settings.customInstructions === "string"
              ? settings.customInstructions
              : undefined,
          claudeHandle: settings.claudeHandle,
        });

        if (authentication === "app") {
          setMessage("Starting Claude...");
          const result = await aha.callEventHandler<AssignWorkResult>({
            extensionId: EXTENSION_ID,
            eventName: "assignWork",
            args: {
              action: "assign",
              record: { id: record.id, typename: record.typename },
              repository: targetRepository,
              task: {
                title,
                body,
                referenceNum: model.referenceNum,
                name: model.name,
              },
            },
          });
          setAssignment(result.assignment);
          setMessage(
            "Claude workflow started. A draft PR will appear after changes are made.",
          );

          setStoredAssignments(
            storeAssignment(storedAssignments, result.assignment, "app"),
          );
        } else {
          const { owner, repo } = repositoryParts(targetRepository);
          const workflowFile = (settings.workflowFile ?? "claude.yml").trim();
          if (mode === "workflow" && !workflowFile)
            throw new Error("Please configure the Claude workflow file.");
          setMessage("Authenticating with GitHub...");
          const token = await getGitHubToken(mode);
          const now = new Date().toISOString();
          setMessage("Creating or finding the pull request...");
          const bootstrap = await bootstrapPullRequest(token, {
            owner,
            repo,
            referenceNum: model.referenceNum,
            name: model.name,
            title,
            body,
            labels: parsePullRequestLabels(settings.pullRequestLabels),
          });
          const currentPullRequestAssignment =
            assignment && isPullRequestAssignment(assignment)
              ? assignment
              : undefined;
          const commonAssignment = {
            repository: `${owner}/${repo}`,
            prNumber: bootstrap.prNumber,
            prUrl: bootstrap.prUrl,
            branch: bootstrap.branch,
            assignedAt: currentPullRequestAssignment?.assignedAt ?? now,
            lastTriggeredAt: now,
          };
          let nextAssignment:
            MentionPullRequestAssignmentData | WorkflowAssignmentData;
          if (mode === "mention") {
            nextAssignment = {
              mode: "mention",
              ...commonAssignment,
            };
            // Keep the PR reachable if triggering Claude fails. It is persisted
            // after a successful trigger, and bootstrap finds it again on retry.
            setAssignment(nextAssignment);
            setMessage("Mentioning Claude on the pull request...");
            await commentOnPullRequest(token, {
              owner,
              repo,
              prNumber: bootstrap.prNumber,
              comment,
            });
            setMessage("Claude mentioned on the pull request.");
          } else {
            const pendingAssignment: WorkflowAssignmentData = {
              mode: "workflow",
              ...commonAssignment,
            };
            setAssignment(pendingAssignment);
            setMessage(`Dispatching ${workflowFile}...`);
            const dispatch = await dispatchClaudeWorkflow(token, {
              owner,
              repo,
              workflowFile,
              ref: bootstrap.baseBranch,
              referenceNum: model.referenceNum,
              prompt: body,
              prNumber: bootstrap.prNumber,
            });
            nextAssignment = {
              ...pendingAssignment,
              workflowRunId: dispatch.workflowRunId,
              workflowRunUrl: dispatch.htmlUrl,
            };
            setAssignment(nextAssignment);
            setMessage("Claude workflow dispatched.");
          }

          const nextStoredAssignments = storeAssignment(
            storedAssignments,
            nextAssignment,
          );
          await record.setExtensionField(
            EXTENSION_ID,
            FIELD_NAME,
            nextStoredAssignments,
          );
          setStoredAssignments(nextStoredAssignments);
        }

        setStatus("success");
      } catch (error) {
        setStatus("error");
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setMessage(`Error: ${errorMessage}`);
      }
    },
    [
      assignment,
      authentication,
      mode,
      record,
      repository,
      settings,
      storedAssignments,
    ],
  );

  const refreshAssignment = useCallback(async () => {
    setStatus("loading");
    setMessage("Checking Claude's progress...");
    try {
      const result = await aha.callEventHandler<AssignWorkResult>({
        extensionId: EXTENSION_ID,
        eventName: "assignWork",
        args: {
          action: "refresh",
          record: { id: record.id, typename: record.typename },
        },
      });
      setAssignment(result.assignment);
      setStoredAssignments((stored) =>
        storeAssignment(stored, result.assignment, "app"),
      );
      setStatus("existing");
      setMessage("");
    } catch (error) {
      setStatus("error");
      setMessage(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, [record]);

  useEffect(() => {
    const selected = assignmentForMode(storedAssignments, mode, authentication);
    setAssignment(selected);
    setStatus(selected ? "existing" : hasSettings ? "idle" : "not-configured");
    setMessage("");
  }, [authentication, mode]);

  useEffect(() => {
    if (
      authentication === "app" &&
      assignmentForMode(existingAssignments, "workflow", "app")
    ) {
      void refreshAssignment();
    }
  }, [record.id, authentication]);

  if (status === "loading") {
    return (
      <SendToAI
        label="Working with Claude..."
        icon={<Icon />}
        button={
          <aha-button kind="secondary" size="small" disabled>
            Working
            <aha-spinner style={{ marginLeft: "6px" }} size="10px" />
          </aha-button>
        }
        footer={message}
      />
    );
  }

  if (status === "not-configured") {
    return (
      <SendToAI
        label="Build with Claude"
        icon={<Icon />}
        button={
          <aha-button
            kind="secondary"
            size="small"
            onClick={(event) => {
              event.preventDefault();
              window.open("/develop/settings/account/extensions");
            }}
          >
            Configure Claude <i className="fa-regular fa-gear" />
          </aha-button>
        }
        footer="Configure a GitHub repository before sending work to Claude."
      />
    );
  }

  if (assignment) {
    const pullRequestAssignment = isPullRequestAssignment(assignment)
      ? assignment
      : undefined;
    const url = pullRequestAssignment
      ? pullRequestAssignment.prUrl
      : "issueUrl" in assignment
        ? assignment.issueUrl
        : "repository" in assignment &&
            assignment.repository &&
            "branch" in assignment
          ? `https://github.com/${assignment.repository}/tree/${encodeURIComponent(assignment.branch)}`
          : "";
    const workflowRunUrl =
      "workflowRunUrl" in assignment ? assignment.workflowRunUrl : undefined;
    return (
      <SendToAI
        label="Assigned to Claude"
        icon={<Icon />}
        button={
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <aha-button
              kind="secondary"
              size="small"
              onClick={(event) => {
                event.preventDefault();
                window.open(url, "_blank", "noopener noreferrer");
              }}
            >
              View{" "}
              {pullRequestAssignment
                ? "PR"
                : "issueUrl" in assignment
                  ? "issue"
                  : "branch"}
              <i className="fa-regular fa-arrow-up-right" />
            </aha-button>
            {workflowRunUrl ? (
              <aha-button
                kind="secondary"
                size="small"
                onClick={(event) => {
                  event.preventDefault();
                  window.open(workflowRunUrl, "_blank", "noopener noreferrer");
                }}
              >
                View run <i className="fa-regular fa-arrow-up-right" />
              </aha-button>
            ) : null}
            {authentication === "app" && assignment.mode === "workflow" ? (
              <aha-button
                kind="secondary"
                size="small"
                onClick={refreshAssignment}
              >
                Refresh <i className="fa-regular fa-rotate-right" />
              </aha-button>
            ) : null}
            <aha-button kind="secondary" size="small" onClick={handleClick}>
              {pullRequestAssignment || authentication === "app"
                ? "Run again"
                : "Create PR"}
              <i className="fa-regular fa-arrow-right" />
            </aha-button>
          </span>
        }
        footer={
          authentication === "app" && isWorkflowAssignment(assignment)
            ? assignment.workflowStatus === "completed"
              ? `Workflow finished: ${assignment.workflowConclusion ?? "unknown"}.${pullRequestAssignment ? "" : " No open PR was found; view the run for details."}`
              : "Claude will open a draft PR after making changes. Refresh to check progress."
            : !pullRequestAssignment
              ? "This legacy issue assignment can be moved to a pull request."
              : null
        }
        alert={
          status === "success" || status === "error" ? (
            <aha-alert
              type={status === "error" ? "danger" : "success"}
              size="mini"
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                overflowWrap: "break-word",
              }}
            >
              {message}
            </aha-alert>
          ) : null
        }
      />
    );
  }

  return (
    <SendToAI
      label="Build with Claude"
      icon={<Icon />}
      button={
        <aha-button kind="secondary" size="small" onClick={handleClick}>
          Send to Claude <i className="fa-regular fa-arrow-right" />
        </aha-button>
      }
      footer={
        <span>
          Share this {record.typename.toLowerCase()} with Claude to begin
          implementation
          {repositories.length > 1 && repository ? (
            <RepositorySelect
              repositories={repositories}
              value={repository}
              onChange={handleRepositoryChange}
            />
          ) : (
            "."
          )}
        </span>
      }
      alert={
        status === "error" ? (
          <aha-alert
            type="danger"
            size="mini"
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              overflowWrap: "break-word",
            }}
          >
            {message}
          </aha-alert>
        ) : null
      }
    />
  );
};

const AssignToClaude = ({
  context,
  record,
  existingAssignments,
}: {
  context: Aha.Context;
  record: RecordType;
  existingAssignments?: StoredClaudeData;
}) => {
  const [settings, { loading }] = useTeamSettings(context, record);
  if (loading || !settings) {
    return <aha-spinner size="20px" />;
  }

  return (
    <AssignClaudeButton
      record={record}
      settings={settings as ClaudeSettings}
      existingAssignments={existingAssignments}
    />
  );
};

aha.on("assignClaudeButton", ({ record, fields }, context) => {
  const typedRecord = record as unknown as RecordType;
  const existingAssignments = fields?.[FIELD_NAME] as
    StoredClaudeData | undefined;

  return (
    <AssignToClaude
      context={context}
      record={typedRecord}
      existingAssignments={existingAssignments}
    />
  );
});
