import { assignWork, AssignWorkRequest } from "../lib/assignWork";
import { EXTENSION_ID } from "../lib/constants";

aha.registerEventHandler({
  extensionId: EXTENSION_ID,
  eventName: "assignWork",
  handler: (args, context) => assignWork(args as AssignWorkRequest, context),
});
