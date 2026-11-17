import {
  describePrototypes,
  findPrototypeReferences,
  PROTOTYPE_CODE_BUDGET,
} from "./prototypes";

const pages: Record<string, unknown> = {};
const find = jest.fn(async (referenceNum: string) => {
  if (!(referenceNum in pages)) throw new Error("Not found");
  return pages[referenceNum];
});

const embed = (referenceNum: string) =>
  `https://big.aha.io/pages/${referenceNum}/prototype_versions/embed`;

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(pages)) delete pages[key];
  (globalThis as any).aha = {
    models: {
      Page: { select: () => ({ merge: () => ({ find }) }) },
      Prototype: { select: () => ({}) },
    },
  };
});

it("finds unique prototype references across descriptions", () => {
  expect(
    findPrototypeReferences([
      `Intro\n\n${embed("DEVOPS-N-1")}\n\n${embed("DEVOPS-N-2")}`,
      undefined,
      `Parent: ${embed("DEVOPS-N-1")} and https://youtu.be/abc`,
    ]),
  ).toEqual(["DEVOPS-N-1", "DEVOPS-N-2"]);
});

it("returns nothing when no prototype is embedded", async () => {
  expect(await describePrototypes(["Just text", undefined])).toBe("");
  expect(find).not.toHaveBeenCalled();
});

it("includes prototype files with App.tsx first", async () => {
  pages["DEVOPS-N-1"] = {
    name: "Checkout flow",
    path: "https://big.aha.io/pages/DEVOPS-N-1",
    referenceNum: "DEVOPS-N-1",
    prototype: {
      contentData: {
        "application.css": "body { margin: 0; }",
        "App.tsx": "export default function App() { return <Cart />; }",
        "components/Cart.tsx": "export function Cart() { return null; }",
      },
    },
  };

  const section = await describePrototypes([embed("DEVOPS-N-1")]);

  expect(find).toHaveBeenCalledWith("DEVOPS-N-1");
  expect(section).toContain(
    "### Prototype: Checkout flow ([DEVOPS-N-1](https://big.aha.io/pages/DEVOPS-N-1))",
  );
  expect(section).toContain(
    "#### `App.tsx`\n\n```tsx\nexport default function App() { return <Cart />; }\n```",
  );
  expect(section).toContain("```css\nbody { margin: 0; }\n```");
  expect(section.indexOf("App.tsx")).toBeLessThan(
    section.indexOf("application.css"),
  );
  expect(section.indexOf("application.css")).toBeLessThan(
    section.indexOf("components/Cart.tsx"),
  );
});

it("uses a longer fence when a file contains backticks", async () => {
  pages["DEVOPS-N-1"] = {
    name: "Docs",
    path: "/pages/DEVOPS-N-1",
    referenceNum: "DEVOPS-N-1",
    prototype: { contentData: { "README.md": "```js\ncode\n```" } },
  };

  const section = await describePrototypes([embed("DEVOPS-N-1")]);

  expect(section).toContain("````md\n```js\ncode\n```\n````");
});

it("lists files that don't fit in the size budget", async () => {
  pages["DEVOPS-N-1"] = {
    name: "Big",
    path: "/pages/DEVOPS-N-1",
    referenceNum: "DEVOPS-N-1",
    prototype: {
      contentData: {
        "App.tsx": "small",
        "huge.ts": "x".repeat(PROTOTYPE_CODE_BUDGET),
      },
    },
  };

  const section = await describePrototypes([embed("DEVOPS-N-1")]);

  expect(section).toContain("#### `App.tsx`");
  expect(section).not.toContain("#### `huge.ts`");
  expect(section).toContain(
    "These files were left out to keep the task within size limits: `huge.ts`.",
  );
});

it("notes prototypes that can't be loaded without failing", async () => {
  pages["DEVOPS-N-2"] = {
    name: "Empty",
    path: "/pages/DEVOPS-N-2",
    referenceNum: "DEVOPS-N-2",
    prototype: null,
  };

  const section = await describePrototypes([
    `${embed("DEVOPS-N-1")} ${embed("DEVOPS-N-2")}`,
  ]);

  expect(section).toContain(
    "### Prototype DEVOPS-N-1\n\nThe code for this prototype could not be loaded.",
  );
  expect(section).toContain(
    "### Prototype DEVOPS-N-2\n\nThe code for this prototype could not be loaded.",
  );
});
