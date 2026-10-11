/**
 * Lambda entry point -- wraps the exact same Express app (app.ts) used
 * by the local dev server (index.ts), via @vendia/serverless-express.
 * No route/business logic lives here or is duplicated; this file only
 * adapts API Gateway's event/context shape to what Express expects.
 *
 * STEP 1 SCOPE (2026-10-11): read-only routes only. The repository
 * layer (repository/facilities.ts, decisionRecord.ts,
 * notificationLog.ts, facilityLinks.ts) reads/writes local files on
 * disk -- fine for the read-only seed YAML (bundled into the Lambda
 * package), but Lambda's filesystem is ephemeral/read-only outside
 * /tmp, so decision records, notification logs, and facility links
 * would silently stop persisting between invocations if exercised
 * here. Deferred until the repository layer is backed by DynamoDB
 * (next step) -- NOT fixed by code changes in this file; the write
 * routes still exist in app.ts and will respond, but their writes
 * won't survive past the current invocation's /tmp, so they are not
 * exercised/tested in this deployment pass.
 */
import serverlessExpress from "@vendia/serverless-express";
import { app } from "./app";

export const handler = serverlessExpress({ app });
