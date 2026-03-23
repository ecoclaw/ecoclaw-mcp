import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { load as yamlLoad } from "js-yaml";

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  dataSources: string[];
  byokKeys: string[];
  author: string;
  /** Resolved filesystem path to the SKILL.md file */
  path: string;
}

interface RawFrontmatter {
  id?: string;
  name?: string;
  description?: string;
  triggers?: string[];
  dataSources?: string[];
  byokKeys?: string[];
  author?: string;
}

/** Parse YAML frontmatter from a SKILL.md file. Returns null if no frontmatter found. */
export function parseFrontmatter(content: string): RawFrontmatter | null {
  if (!content.startsWith("---")) return null;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return null;
  const yaml = content.slice(3, end).trim();
  try {
    const parsed = yamlLoad(yaml);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as RawFrontmatter;
  } catch {
    return null;
  }
}

/** Build a SkillManifest from raw frontmatter + file path, filling in defaults. */
function toManifest(raw: RawFrontmatter, filePath: string): SkillManifest {
  const id = raw.id ?? filePath.split("/").at(-2) ?? "unknown";
  return {
    id,
    name: raw.name ?? id,
    description: raw.description ?? "",
    triggers: raw.triggers ?? [],
    dataSources: raw.dataSources ?? [],
    byokKeys: raw.byokKeys ?? [],
    author: raw.author ?? "unknown",
    path: filePath,
  };
}

/** Collect all SKILL.md paths under a given directory (non-recursive top-level subdirs). */
function collectSkillMds(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const paths: string[] = [];
  // Direct SKILL.md in dir itself
  const direct = join(dir, "SKILL.md");
  if (existsSync(direct)) paths.push(direct);
  // SKILL.md inside subdirectories
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(dir, entry.name, "SKILL.md");
      if (existsSync(candidate)) paths.push(candidate);
    }
  } catch {
    // ignore permission errors
  }
  return paths;
}

/**
 * Discover all skills available from:
 *  1. <dir>/skills/          — local project skills
 *  2. <dir>/node_modules/@gonzih/skills-*\/skills/  — installed skill packages
 *  3. <dir>/node_modules/@ecoclaw/*\/skills/         — ecoclaw skill packages
 *
 * If filter_by_keys is true, only skills whose byokKeys are ALL present in
 * process.env are returned (skills with no byokKeys are always included).
 */
export function discoverSkills(
  dir: string = process.cwd(),
  filterByKeys = false
): SkillManifest[] {
  const skillMdPaths: string[] = [];

  // 1. Local skills dir
  skillMdPaths.push(...collectSkillMds(join(dir, "skills")));

  // 2. @gonzih/skills-* packages
  const gonzihDir = join(dir, "node_modules", "@gonzih");
  if (existsSync(gonzihDir)) {
    for (const pkg of readdirSync(gonzihDir, { withFileTypes: true })) {
      if (!pkg.isDirectory() || !pkg.name.startsWith("skills-")) continue;
      skillMdPaths.push(...collectSkillMds(join(gonzihDir, pkg.name, "skills")));
    }
  }

  // 3. @ecoclaw/* packages
  const ecoDir = join(dir, "node_modules", "@ecoclaw");
  if (existsSync(ecoDir)) {
    for (const pkg of readdirSync(ecoDir, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      skillMdPaths.push(...collectSkillMds(join(ecoDir, pkg.name, "skills")));
    }
  }

  const manifests: SkillManifest[] = [];
  for (const filePath of skillMdPaths) {
    try {
      const content = readFileSync(filePath, "utf-8");
      const raw = parseFrontmatter(content);
      if (!raw) continue;
      manifests.push(toManifest(raw, filePath));
    } catch {
      // skip unreadable files
    }
  }

  if (!filterByKeys) return manifests;

  return manifests.filter(
    (m) => m.byokKeys.length === 0 || m.byokKeys.every((k) => !!process.env[k])
  );
}

/**
 * Build an instruction string for agent delegation from a list of skill names.
 * e.g. "Make sure to use the following skills: 'arxiv', 'fred-economics'"
 */
export function buildSkillContext(skillNames: string[]): string {
  if (skillNames.length === 0) return "";
  const quoted = skillNames.map((n) => `'${n}'`).join(", ");
  return `Make sure to use the following skills: ${quoted}`;
}

/**
 * Scan all discovered skills and report which byok keys are present / missing
 * in process.env.
 */
export function listByokKeys(
  dir: string = process.cwd()
): { present: string[]; missing: string[] } {
  const skills = discoverSkills(dir, false);
  const allKeys = new Set<string>();
  for (const s of skills) {
    for (const k of s.byokKeys) allKeys.add(k);
  }
  const present: string[] = [];
  const missing: string[] = [];
  for (const key of Array.from(allKeys).sort()) {
    if (process.env[key]) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }
  return { present, missing };
}
