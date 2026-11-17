// Embedded prototypes are stored in descriptions as links to
// `<host>/pages/<REF>/prototype_versions/embed`.
const PROTOTYPE_EMBED_PATTERN =
  /\/pages\/([A-Za-z0-9-]+)\/prototype_versions\/embed/g;

// The task details become a PR body or workflow input, which GitHub caps at
// 65,536 characters, so prototype code gets a share of that.
export const PROTOTYPE_CODE_BUDGET = 40_000;

type PrototypePage = {
  name: string | null;
  path: string;
  referenceNum: string;
  prototype: { contentData: Record<string, string> } | null;
};

export function findPrototypeReferences(
  markdownBodies: Array<string | undefined>,
): string[] {
  const references = new Set<string>();
  for (const markdown of markdownBodies) {
    for (const match of (markdown ?? "").matchAll(PROTOTYPE_EMBED_PATTERN)) {
      references.add(match[1]);
    }
  }
  return [...references];
}

const LANGUAGES: Record<string, string> = {
  css: "css",
  html: "html",
  js: "js",
  json: "json",
  jsx: "jsx",
  md: "md",
  ts: "ts",
  tsx: "tsx",
};

function codeBlock(fileName: string, content: string): string {
  const language = LANGUAGES[fileName.split(".").pop() ?? ""] ?? "";
  // Use a fence longer than any backtick run in the file so it can't close early.
  const longestBackticks = Math.max(
    0,
    ...(content.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(Math.max(3, longestBackticks + 1));
  return `#### \`${fileName}\`\n\n${fence}${language}\n${content}\n${fence}\n`;
}

// App.tsx is the prototype's entry point, so it goes first.
function orderedFiles(contentData: Record<string, string>): string[] {
  return Object.keys(contentData).sort((a, b) => {
    if (a === "App.tsx") return -1;
    if (b === "App.tsx") return 1;
    return a.localeCompare(b);
  });
}

async function fetchPrototypePage(
  referenceNum: string,
): Promise<PrototypePage | null> {
  // The generated model types treat JSON fields like contentData as relations,
  // so they can't be passed to select() without these narrower shapes.
  const pageModel = aha.models.Page as unknown as {
    select(...fields: string[]): {
      merge(subqueries: Record<string, unknown>): {
        find(id: string): Promise<PrototypePage | null>;
      };
    };
  };
  const prototypeModel = aha.models.Prototype as unknown as {
    select(...fields: string[]): unknown;
  };

  try {
    return await pageModel
      .select("name", "path", "referenceNum")
      .merge({ prototype: prototypeModel.select("contentData") })
      .find(referenceNum);
  } catch {
    return null;
  }
}

/**
 * Builds a markdown section with the source code of prototypes embedded in
 * the given descriptions, or an empty string when there are none.
 */
export async function describePrototypes(
  markdownBodies: Array<string | undefined>,
): Promise<string> {
  const references = findPrototypeReferences(markdownBodies);
  if (references.length === 0) return "";

  let remainingBudget = PROTOTYPE_CODE_BUDGET;
  const sections: string[] = [];

  for (const referenceNum of references) {
    const page = await fetchPrototypePage(referenceNum);
    if (!page?.prototype) {
      sections.push(
        `### Prototype ${referenceNum}\n\nThe code for this prototype could not be loaded.\n`,
      );
      continue;
    }

    const files = page.prototype.contentData ?? {};
    const included: string[] = [];
    const omitted: string[] = [];
    for (const fileName of orderedFiles(files)) {
      const block = codeBlock(fileName, files[fileName]);
      if (block.length <= remainingBudget) {
        included.push(block);
        remainingBudget -= block.length;
      } else {
        omitted.push(fileName);
      }
    }

    let section = `### Prototype: ${page.name || referenceNum} ([${page.referenceNum}](${page.path}))\n\n`;
    section += `Source files of a prototype embedded in the description. Use it as a reference for the intended behavior and design; it is not production code.\n\n`;
    section += included.join("\n");
    if (omitted.length > 0) {
      section += `\nThese files were left out to keep the task within size limits: ${omitted
        .map((fileName) => `\`${fileName}\``)
        .join(", ")}.\n`;
    }
    sections.push(section);
  }

  return sections.join("\n");
}
