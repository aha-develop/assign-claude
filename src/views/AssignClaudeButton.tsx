import { SendToAI } from "@aha-app/aha-develop-react";
import React, { useCallback, useState } from "react";
import { buildIssue, RecordType } from "../lib/buildIssue";
import { EXTENSION_ID, FIELD_NAME } from "../lib/constants";
import {
  bootstrapPullRequest,
  commentOnPullRequest,
  dispatchClaudeWorkflow,
  getGitHubToken,
} from "../lib/github";
import {
  assignmentForMode,
  ClaudeAssignmentData,
  ClaudeSettings,
  isPullRequestAssignment,
  MentionPullRequestAssignmentData,
  parsePullRequestLabels,
  StoredClaudeData,
  storeAssignment,
  triggerModeFor,
  WorkflowAssignmentData,
} from "../lib/types";
import { useTeamSettings } from "../lib/useTeamSettings";
import { Icon } from "./Icon";

type AssignClaudeButtonProps = {
  record: RecordType;
  settings: ClaudeSettings;
  existingAssignments?: StoredClaudeData;
};

type Status =
  | "not-configured"
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "existing";

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

const AssignClaudeButton: React.FC<AssignClaudeButtonProps> = ({
  record,
  settings,
  existingAssignments,
}) => {
  const mode = triggerModeFor(settings);
  const matchingAssignment = assignmentForMode(existingAssignments, mode);
  const hasSettings = !!settings.repository;

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
        const { owner, repo } = repositoryParts(settings.repository);
        const workflowFile = (settings.workflowFile ?? "claude.yml").trim();
        if (mode === "workflow" && !workflowFile) {
          throw new Error("Please configure the Claude workflow file.");
        }

        const { title, body, comment, model } = await buildIssue({
          record,
          customInstructions:
            typeof settings.customInstructions === "string"
              ? settings.customInstructions
              : undefined,
          claudeHandle: settings.claudeHandle,
        });

        setMessage("Authenticating with GitHub...");
        const token = await getGitHubToken(mode);
        const now = new Date().toISOString();
        setMessage("Creating or finding the pull request...");
        const bootstrap = await bootstrapPullRequest(token, {
          owner,
          repo,
          referenceNum: model.referenceNum,
          title,
          body,
          labels: parsePullRequestLabels(settings.pullRequestLabels),
        });
        const currentPullRequestAssignment =
          assignment && isPullRequestAssignment(assignment)
            ? assignment
            : undefined;
        const commonAssignment = {
          prNumber: bootstrap.prNumber,
          prUrl: bootstrap.prUrl,
          branch: bootstrap.branch,
          assignedAt: currentPullRequestAssignment?.assignedAt ?? now,
          lastTriggeredAt: now,
        };
        let nextAssignment:
          | MentionPullRequestAssignmentData
          | WorkflowAssignmentData;
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

        setStatus("success");
      } catch (error) {
        setStatus("error");
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setMessage(`Error: ${errorMessage}`);
      }
    },
    [assignment, mode, record, settings, storedAssignments],
  );

  if (status === "loading") {
    return (
      <SendToAI
        label="Sending to Claude..."
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
              View {pullRequestAssignment ? "PR" : "issue"}
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
            {!pullRequestAssignment ? (
              <aha-button
                kind="secondary"
                size="small"
                onClick={handleClick}
              >
                Create PR <i className="fa-regular fa-code-pull-request" />
              </aha-button>
            ) : null}
          </span>
        }
        footer={
          !pullRequestAssignment
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
      footer={`Share this ${record.typename.toLowerCase()} with Claude to begin implementation.`}
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
    | StoredClaudeData
    | undefined;

  return (
    <AssignToClaude
      context={context}
      record={typedRecord}
      existingAssignments={existingAssignments}
    />
  );
});
