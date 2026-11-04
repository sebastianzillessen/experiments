import { rmSync } from "node:fs";
import { resolve } from "node:path";

/** Delete the throwaway test DB (and WAL/SHM siblings) for a clean run. */
export default function globalSetup() {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(resolve("data", `test.db${suffix}`), { force: true });
  }
}
