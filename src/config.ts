import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";

export const ECOCLAW_DIR = join(homedir(), ".ecoclaw");
export const ECOCLAW_SKILLS_DIR = join(ECOCLAW_DIR, "skills");
export const ECOCLAW_CONFIG_PATH = join(ECOCLAW_DIR, "config.json");
export const ECOCLAW_HISTORY_PATH = join(ECOCLAW_DIR, "history.jsonl");
export const CLAUDE_SKILLS_DIR = join(homedir(), ".claude", "skills");

export interface SkillConfig {
  source: string;
  version: string;
  customized: boolean;
  custom_path?: string;
}

export interface Config {
  version: string;
  installed_at: string;
  profile: {
    name: string;
    business: string;
    packages: string[];
  };
  skills: Record<string, SkillConfig>;
}

const DEFAULT_CONFIG: Config = {
  version: "0.1.0",
  installed_at: new Date().toISOString().split("T")[0],
  profile: { name: "", business: "", packages: [] },
  skills: {},
};

export function ensureEcoClawDir(): void {
  if (!existsSync(ECOCLAW_DIR)) mkdirSync(ECOCLAW_DIR, { recursive: true });
  if (!existsSync(ECOCLAW_SKILLS_DIR))
    mkdirSync(ECOCLAW_SKILLS_DIR, { recursive: true });
}

export function readConfig(): Config {
  ensureEcoClawDir();
  if (!existsSync(ECOCLAW_CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  try {
    return JSON.parse(readFileSync(ECOCLAW_CONFIG_PATH, "utf8")) as Config;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(config: Config): void {
  ensureEcoClawDir();
  writeFileSync(ECOCLAW_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

export function appendHistorySync(entry: Record<string, unknown>): void {
  ensureEcoClawDir();
  const line =
    JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + "\n";
  writeFileSync(ECOCLAW_HISTORY_PATH, line, { flag: "a" });
}
