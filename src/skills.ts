import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  cpSync,
} from "fs";
import { join } from "path";
import {
  ECOCLAW_SKILLS_DIR,
  CLAUDE_SKILLS_DIR,
  readConfig,
  writeConfig,
  appendHistorySync,
} from "./config.js";

export interface SkillInfo {
  name: string;
  version: string;
  source: string;
  customized: boolean;
  description: string;
}

/** Returns path to the user-local override of a skill, or null if not customized. */
export function userSkillPath(name: string): string | null {
  const p = join(ECOCLAW_SKILLS_DIR, name, "SKILL.md");
  return existsSync(p) ? p : null;
}

/** Returns path to the npm-installed version of a skill, or null if not found. */
export function npmSkillPath(name: string): string | null {
  const p = join(CLAUDE_SKILLS_DIR, name, "SKILL.md");
  return existsSync(p) ? p : null;
}

/** Read a skill's SKILL.md — user version first, then npm version. */
export function readSkill(name: string): {
  content: string;
  source: "user" | "npm";
  path: string;
} {
  const userPath = userSkillPath(name);
  if (userPath) {
    return { content: readFileSync(userPath, "utf8"), source: "user", path: userPath };
  }
  const npmPath = npmSkillPath(name);
  if (npmPath) {
    return { content: readFileSync(npmPath, "utf8"), source: "npm", path: npmPath };
  }
  throw new Error(
    `Skill "${name}" not found in ~/.ecoclaw/skills/ or ~/.claude/skills/`
  );
}

/** Write a skill to the user-local override directory. */
export function writeUserSkill(name: string, content: string): string {
  const dir = join(ECOCLAW_SKILLS_DIR, name);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const skillPath = join(dir, "SKILL.md");
  writeFileSync(skillPath, content, "utf8");
  return skillPath;
}

/** Extract description from SKILL.md (first non-heading paragraph). */
function extractDescription(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("---")) {
      return trimmed.slice(0, 120);
    }
  }
  return "(no description)";
}

/** List all installed skills from both ~/.claude/skills/ and ~/.ecoclaw/skills/. */
export function listSkills(): SkillInfo[] {
  const config = readConfig();
  const seen = new Set<string>();
  const skills: SkillInfo[] = [];

  // Gather names from npm-installed skills
  if (existsSync(CLAUDE_SKILLS_DIR)) {
    for (const entry of readdirSync(CLAUDE_SKILLS_DIR, { withFileTypes: true })) {
      if (entry.isDirectory()) seen.add(entry.name);
    }
  }

  // Gather names from user-customized / forked skills
  if (existsSync(ECOCLAW_SKILLS_DIR)) {
    for (const entry of readdirSync(ECOCLAW_SKILLS_DIR, { withFileTypes: true })) {
      if (entry.isDirectory()) seen.add(entry.name);
    }
  }

  for (const name of seen) {
    const customized = userSkillPath(name) !== null;
    let content = "";
    try {
      content = readSkill(name).content;
    } catch {
      continue;
    }

    const skillConfig = config.skills[name];
    skills.push({
      name,
      version: skillConfig?.version ?? "unknown",
      source: skillConfig?.source ?? (customized ? "local" : "~/.claude/skills"),
      customized,
      description: extractDescription(content),
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** Fork a skill — creates an independent copy under a new name. */
export function forkSkill(
  name: string,
  forkName?: string
): { forkedAs: string; location: string; message: string } {
  const resolved = forkName ?? `${name}-custom`;
  const { content } = readSkill(name);

  const location = writeUserSkill(resolved, content);

  const config = readConfig();
  config.skills[resolved] = {
    source: `fork of ${name}`,
    version: "local",
    customized: true,
    custom_path: location,
  };
  writeConfig(config);

  appendHistorySync({ op: "fork", from: name, to: resolved });

  return {
    forkedAs: resolved,
    location,
    message: `Forked "${name}" → "${resolved}". Use it independently; both show up in list_skills.`,
  };
}

/** Mark a skill as customized in config.json. */
export function markCustomized(name: string, skillPath: string): void {
  const config = readConfig();
  if (!config.skills[name]) {
    config.skills[name] = {
      source: "unknown",
      version: "unknown",
      customized: true,
      custom_path: skillPath,
    };
  } else {
    config.skills[name].customized = true;
    config.skills[name].custom_path = skillPath;
  }
  writeConfig(config);
}
