type FetchedFeature = Aha.Feature & {
  referenceNum: string;
  name: string;
  path: string;
  description?: { markdownBody?: string };
};

type FetchedRequirement = Aha.Requirement & {
  referenceNum: string;
  name: string;
  path: string;
  description?: { markdownBody?: string };
  feature?: {
    referenceNum: string;
    name?: string;
    description?: { markdownBody?: string };
  };
  tasks?: Array<{
    name: string;
    body?: string;
  }>;
};

type FeatureType = Pick<
  Aha.Feature,
  "setExtensionField" | "getExtensionField"
> & {
  typename: "Feature";
  id: string;
  referenceNum: string;
};
type RequirementType = Pick<
  Aha.Requirement,
  "setExtensionField" | "getExtensionField"
> & {
  typename: "Requirement";
  id: string;
  referenceNum: string;
};

export type RecordType = FeatureType | RequirementType;

/**
 * Data stored in extension fields to track Claude assignment.
 */
export interface ClaudeIssueData {
  issueNumber: number;
  issueUrl: string;
  assignedAt: string;
}

/**
 * Fetches full record details including name, path, and description.
 */
async function describeFeature(
  record: FeatureType,
): Promise<[string, FetchedFeature]> {
  const feature = await aha.models.Feature.select(
    "id",
    "name",
    "path",
    "referenceNum",
  )
    .merge({
      description: ["markdownBody"],
      tasks: aha.models.Task.select("name", "body"),
      requirements: aha.models.Requirement.select("name", "referenceNum"),
    })
    .find(record.referenceNum);

  if (!feature) {
    throw new Error("Failed to fetch feature details.");
  }

  const body = `### Description

${feature.description?.markdownBody}

${
  feature.requirements && feature.requirements.length > 0
    ? "### Requirements\n"
    : ""
}${feature.requirements
    ?.map(
      (req) => `- **${req.referenceNum}**: ${req.name || "No name provided"}`,
    )
    .join("\n")}

${feature.tasks && feature.tasks.length > 0 ? "### Todos\n" : ""}${feature.tasks
    ?.map((task) => `- ${task.name}${task.body ? `\n${task.body}` : ""}`)
    .join("\n\n")}

**Aha! Reference:** [${record.referenceNum}](${feature.path})
`;
  return [body, feature];
}

async function describeRequirement(
  record: RequirementType,
): Promise<[string, FetchedRequirement]> {
  const requirement: FetchedRequirement = await aha.models.Requirement.select(
    "id",
    "name",
    "referenceNum",
    "path",
  )
    .merge({
      description: ["markdownBody"],
      tasks: aha.models.Task.select("name", "body"),
      feature: aha.models.Feature.select("name", "referenceNum").merge({
        description: ["markdownBody"],
      }),
    })
    .find(record.referenceNum);

  if (!requirement) {
    throw new Error("Failed to fetch requirement details.");
  }

  const body = `### Description

${requirement.description?.markdownBody}

## Feature ${requirement.feature.referenceNum}

${requirement.feature.description?.markdownBody}

${
  requirement.tasks && requirement.tasks.length > 0 ? "### Todos\n" : ""
}${requirement.tasks
    ?.map((task) => `- **${task.name}**\n\n${task.body || ""}`)
    .join("\n\n")}

**Aha! Reference:** [${record.referenceNum}](${requirement.path})
`;

  return [body, requirement];
}

/**
 * Builds the issue body for a GitHub issue to be assigned to Claude.
 *
 * @param record - The minimal record from the Aha! context
 * @param baseBranch - The base branch for PRs
 * @param customInstructions - Additional instructions for Claude (optional)
 */
export async function buildIssue(
  record: RecordType,
  baseBranch: string,
  customInstructions?: string,
  agentHandle?: string,
): Promise<{
  title: string;
  body: string;
  comment: string;
  model: FetchedFeature | FetchedRequirement;
}> {
  let [body, model] =
    record.typename === "Feature"
      ? await describeFeature(record as FeatureType)
      : await describeRequirement(record as RequirementType);

  const comment = `
@${agentHandle ? agentHandle.replace(/^@/, "") : "claude"} please create a pull request to implement this feature.

**IMPORTANT - Branch and PR Naming Requirement:**
- You MUST include \`${model.referenceNum}\` in the branch name
- You MUST include \`${model.referenceNum}\` in the PR title
- Create the PR against the \`${baseBranch}\` branch
`;

  if (customInstructions) {
    body += `
### Additional Instructions

${customInstructions}
`;
  }

  const title = `${model.referenceNum}: ${model.name}`;

  return {
    title,
    body,
    comment,
    model,
  };
}
