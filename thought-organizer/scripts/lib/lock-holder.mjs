// Test-only worker; callers pass an isolated temporary database.
import { DatabaseSync } from "node:sqlite";
const database = new DatabaseSync(process.argv[2]);
database.exec("CREATE TABLE IF NOT EXISTS lock_probe(value TEXT)");
database.exec("BEGIN IMMEDIATE");
database.prepare("INSERT INTO lock_probe VALUES(?)").run("isolated-test-data");
let released = false;
function release() {
  if (released) return;
  released = true;
  database.exec("COMMIT");
  database.close();
  if (process.connected) process.disconnect();
}
process.once("message", release);
process.send?.("locked");
const duration = Number(process.argv[3] || 0);
if (duration) setTimeout(release, duration);
