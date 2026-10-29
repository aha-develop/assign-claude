import {
  assignWork,
  AssignWorkRequestSchema,
  AssignWorkResultSchema,
} from "../lib/assignWork";
import { EXTENSION_ID } from "../lib/constants";

aha.registerEventHandler({
  extensionId: EXTENSION_ID,
  eventName: "assignWork",
  schema: AssignWorkRequestSchema,
  resultSchema: AssignWorkResultSchema,
  handler: assignWork,
});
