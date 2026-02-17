import React, { useCallback, useEffect, useState } from "react";
import { buildIssue, ClaudeIssueData, RecordType } from "../lib/buildIssue";
import { createIssue, getGitHubToken } from "../lib/github";
import { Icon } from "./Icon";
import { SendToAI } from "./SendToAI";
import { EXTENSION_ID, FIELD_NAME } from "../lib/constants";

type Settings = {
  repository?: string;
  baseBranch?: string;
  customInstructions?: string;
};

// Todo exposed by aha.runtime in the future
type GetSettings = (args: { teamId: string }) => Promise<Aha.Settings>;

type AssignClaudeButtonProps = {
  record: RecordType;
  settings?: Settings;
  existingIssue?: ClaudeIssueData;
};

type Status =
  | "not-configured"
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "existing";

const AssignClaudeButton: React.FC<AssignClaudeButtonProps> = ({
  record,
  settings,
  existingIssue,
}) => {
  const hasSettings = !!settings?.repository;

  const [status, setStatus] = useState<Status>(
    existingIssue ? "existing" : hasSettings ? "idle" : "not-configured",
  );
  const [message, setMessage] = useState<string>(
    existingIssue ? "Assigned to Claude." : "",
  );
  const [issueUrl, setIssueUrl] = useState<string>(
    existingIssue?.issueUrl || "",
  );

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      setStatus("loading");
      setMessage("Loading record details...");

      try {
        const repository = settings.repository?.trim();
        if (!repository || !repository.includes("/")) {
          throw new Error(
            "Please configure the repository setting (e.g., owner/repo)",
          );
        }
        const [owner, repo] = repository.split("/");
        const baseBranch = settings.baseBranch?.trim();

        const customInstructions = settings.customInstructions;

        const { title, body, comment } = await buildIssue(
          record,
          baseBranch,
          customInstructions,
        );

        setMessage("Authenticating with GitHub...");
        const token = await getGitHubToken();

        setMessage("Creating GitHub Issue...");
        const issue = await createIssue(token, {
          owner,
          repo,
          title,
          body,
          comment,
        });

        await record.setExtensionField(EXTENSION_ID, FIELD_NAME, {
          issueNumber: issue.number,
          issueUrl: issue.html_url,
          assignedAt: new Date().toISOString(),
        } as ClaudeIssueData);

        setStatus("success");
        setMessage("GitHub Issue created and assigned to Claude.");
        setIssueUrl(issue.html_url);
      } catch (error) {
        setStatus("error");
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setMessage(`Error: ${errorMessage}`);
      }
    },
    [record, settings],
  );

  return (
    <>
      {(status === "idle" ||
        status === "error" ||
        status === "not-configured") && (
        <SendToAI
          label="Build with Claude"
          icon={<Icon />}
          button={
            status === "not-configured" ? (
              <aha-button
                kind="secondary"
                size="small"
                onClick={(e) => {
                  e.preventDefault();
                  window.open("/develop/settings/account/extensions");
                }}
              >
                Configure Claude <i className="fa-regular fa-gear"></i>
              </aha-button>
            ) : (
              <aha-button kind="secondary" size="small" onClick={handleClick}>
                Send to Claude <i className="fa-regular fa-arrow-right"></i>
              </aha-button>
            )
          }
          footer={`Share this ${record.typename.toLowerCase()} with Claude to begin implementation.`}
          alert={
            status === "error" ? (
              <aha-alert type="danger" size="mini">
                {message}
              </aha-alert>
            ) : null
          }
        />
      )}

      {status === "loading" && (
        <SendToAI
          label="Sending to Claude..."
          icon={<Icon />}
          button={
            <aha-button
              kind="secondary"
              size="small"
              onClick={(e) => {
                e.preventDefault();
              }}
            >
              <span>
                Creating issue
                <aha-spinner style={{ marginLeft: "6px" }} size="10px" />
              </span>
            </aha-button>
          }
          footer={message}
        />
      )}

      {(status === "success" || status === "existing") && (
        <SendToAI
          label="Assigned to Claude"
          icon={<Icon />}
          button={
            <aha-button
              kind="secondary"
              size="small"
              onClick={(e) => {
                e.preventDefault();
                window.open(issueUrl, "_blank", "noopener noreferrer");
              }}
            >
              View issue
              <i className="fa-regular fa-arrow-up-right" />
            </aha-button>
          }
          alert={
            status === "success" ? (
              <aha-alert type="success" size="mini">
                {message}
              </aha-alert>
            ) : null
          }
        />
      )}
    </>
  );
};

const useTeamSettings = (getSettings: GetSettings) => {
  const [settings, setSettings] = useState<Aha.Settings>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings({ teamId: window.currentProjectId })
      .then((s) => {
        console.log(`got some settings: ${s}`);
        setSettings(s);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [window.currentProjectId]);

  console.log(
    `loading for team ${window.currentProjectId}: ${loading}, settings: ${JSON.stringify(settings, null, 2)}`,
  );

  return [settings, { loading }] as const;
};

const AssignToClaude = ({
  getSettings,
  record,
  existingIssue,
}: {
  getSettings: GetSettings;
  record: RecordType;
  existingIssue?: ClaudeIssueData;
}) => {
  const [settings, { loading }] = useTeamSettings(getSettings);
  if (loading || !settings) {
    return <aha-spinner size="20px" />;
  }
  return (
    <AssignClaudeButton
      record={record}
      settings={settings}
      existingIssue={existingIssue}
    />
  );
};

aha.on("assignClaudeButton", ({ record, fields }, { getSettings }) => {
  const typedRecord = record as unknown as RecordType;
  const existingIssue = fields?.[FIELD_NAME] as ClaudeIssueData | undefined;

  return (
    <AssignToClaude
      getSettings={getSettings}
      record={typedRecord}
      existingIssue={existingIssue}
    />
  );
});
