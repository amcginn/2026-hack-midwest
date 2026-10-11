/**
 * Local-dev entry point -- a plain long-running Express server.
 * All route/business logic lives in app.ts, which this just imports
 * and listens on. See app.ts module doc for why the split exists
 * (the same Express app also runs as a Lambda handler via lambda.ts).
 */
import { app, PORT } from "./app";

app.listen(PORT, () => {
  console.log(`USDA facility decisions server listening on http://localhost:${PORT}`);
});
