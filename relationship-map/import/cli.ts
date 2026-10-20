import { runImport } from "./run.ts";

// CLI entry: `npm run import`. Reads local WhatsApp/iMessage/Mail/Contacts data
// and populates the relationship-map database (DB_PATH env override respected).
const summary = runImport();
console.log("Import complete:");
console.log(`  contacts imported : ${summary.contactsImported}`);
console.log(`  placed on map     : ${summary.placed}`);
console.log(`  updated existing  : ${summary.updated}`);
console.log(`  archived (hidden) : ${summary.archivedHidden}`);
console.log(`  unmatched handles : ${summary.unmatchedHandles}`);
process.exit(0);
