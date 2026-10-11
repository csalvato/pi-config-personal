import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { defaults, parseConfig, type Config } from "./core.ts";

function read(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
export class ConfigStore {
  private previous: string | undefined;
  readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  load(): Config {
    this.previous = read(this.path);
    if (this.previous === undefined) return defaults();
    try {
      return parseConfig(JSON.parse(this.previous));
    } catch {
      throw new Error(
        `Invalid router config: ${this.path}. Fix it before enabling routing.`,
      );
    }
  }
  save(config: Config): void {
    const checked = parseConfig(config);
    mkdirSync(dirname(this.path), { recursive: true });
    const lockPath = `${this.path}.lock`;
    let lock: number;
    try {
      lock = openSync(lockPath, "wx", 0o600);
    } catch {
      throw new Error(
        `Router config is locked: ${lockPath}. Retry after the other writer finishes.`,
      );
    }
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      if (read(this.path) !== this.previous)
        throw new Error(
          "Router config changed in another session. Reopen /router and retry.",
        );
      const content = `${JSON.stringify(checked, null, 2)}\n`;
      writeFileSync(temporary, content, { mode: 0o600, flag: "wx" });
      renameSync(temporary, this.path);
      this.previous = content;
    } finally {
      try {
        unlinkSync(temporary);
      } catch {}
      closeSync(lock);
      unlinkSync(lockPath);
    }
  }
}
