import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Try loading from apps/api/src -> ../../.. -> monorepo root
config({ path: resolve(__dirname, "../../../.env") });
// Also try relative to CWD (when run via turbo from monorepo root)
config({ path: resolve(process.cwd(), ".env") });

import "./index.js";
