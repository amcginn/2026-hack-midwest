import path from "node:path";

// data/synthetic/*.yaml lives at the project root, not inside server/
// -- same pattern as the .env path fix in index.ts.
export const SYNTHETIC_DATA_DIR = path.resolve(__dirname, "../../../data/synthetic");
