import { existsSync } from "node:fs";
// Next loads these automatically; CLI tools need the same precedence.
for (const path of [".env.local", ".env"])
  if (existsSync(path)) process.loadEnvFile(path);
