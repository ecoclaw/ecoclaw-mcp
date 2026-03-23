import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseFrontmatter,
  discoverSkills,
  buildSkillContext,
  listByokKeys,
} from "./discovery.js";

// ─── parseFrontmatter ────────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("parses valid YAML frontmatter", () => {
    const content = `---
id: my-skill
name: My Skill
description: Does a thing
triggers:
  - keyword
byokKeys:
  - MY_API_KEY
author: alice
---
The rest of the file.
`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("my-skill");
    expect(result!.name).toBe("My Skill");
    expect(result!.byokKeys).toEqual(["MY_API_KEY"]);
    expect(result!.author).toBe("alice");
  });

  it("returns null when no frontmatter present", () => {
    expect(parseFrontmatter("# Just a heading\nSome content")).toBeNull();
  });

  it("returns null when closing --- is missing", () => {
    expect(parseFrontmatter("---\nid: broken")).toBeNull();
  });

  it("returns null for non-object YAML", () => {
    expect(parseFrontmatter("---\n- item1\n- item2\n---\n")).toBeNull();
  });
});

// ─── discoverSkills ──────────────────────────────────────────────────────────

const SKILL_MD = (id: string, byokKeys: string[] = []) => `---
id: ${id}
name: ${id} skill
description: A test skill
triggers:
  - trigger-${id}
byokKeys:
${byokKeys.map((k) => `  - ${k}`).join("\n") || "  []"}
author: test-author
---
Skill content here.
`;

const SKILL_MD_NO_BYOK = (id: string) => `---
id: ${id}
name: ${id} skill
description: A test skill
---
Skill content here.
`;

function setupSkillsDir(base: string, structure: Record<string, string>) {
  for (const [rel, content] of Object.entries(structure)) {
    const full = join(base, rel);
    mkdirSync(full.replace(/\/[^/]+$/, ""), { recursive: true });
    writeFileSync(full, content, "utf-8");
  }
}

describe("discoverSkills", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `ecoclaw-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("discovers skills in <dir>/skills/", () => {
    setupSkillsDir(tmpDir, {
      "skills/alpha/SKILL.md": SKILL_MD_NO_BYOK("alpha"),
      "skills/beta/SKILL.md": SKILL_MD_NO_BYOK("beta"),
    });
    const skills = discoverSkills(tmpDir);
    expect(skills.map((s) => s.id).sort()).toEqual(["alpha", "beta"]);
  });

  it("discovers skills in @gonzih/skills-* packages", () => {
    setupSkillsDir(tmpDir, {
      "node_modules/@gonzih/skills-realestate/skills/listing/SKILL.md":
        SKILL_MD_NO_BYOK("listing"),
    });
    const skills = discoverSkills(tmpDir);
    expect(skills.map((s) => s.id)).toContain("listing");
  });

  it("discovers skills in @ecoclaw/* packages", () => {
    setupSkillsDir(tmpDir, {
      "node_modules/@ecoclaw/finance/skills/budgeting/SKILL.md":
        SKILL_MD_NO_BYOK("budgeting"),
    });
    const skills = discoverSkills(tmpDir);
    expect(skills.map((s) => s.id)).toContain("budgeting");
  });

  it("skips SKILL.md files without frontmatter", () => {
    setupSkillsDir(tmpDir, {
      "skills/no-front/SKILL.md": "# No frontmatter here",
    });
    const skills = discoverSkills(tmpDir);
    expect(skills).toHaveLength(0);
  });

  it("filter_by_keys=true excludes skills with missing env keys", () => {
    setupSkillsDir(tmpDir, {
      "skills/needs-key/SKILL.md": SKILL_MD("needs-key", ["SOME_MISSING_KEY_XYZ"]),
      "skills/free/SKILL.md": SKILL_MD_NO_BYOK("free"),
    });
    const all = discoverSkills(tmpDir, false);
    expect(all).toHaveLength(2);

    const filtered = discoverSkills(tmpDir, true);
    const ids = filtered.map((s) => s.id);
    expect(ids).not.toContain("needs-key");
    expect(ids).toContain("free");
  });

  it("filter_by_keys=true includes skills whose env keys are set", () => {
    process.env["ECOCLAW_TEST_KEY_ABC"] = "test-value";
    try {
      setupSkillsDir(tmpDir, {
        "skills/with-key/SKILL.md": SKILL_MD("with-key", ["ECOCLAW_TEST_KEY_ABC"]),
      });
      const filtered = discoverSkills(tmpDir, true);
      expect(filtered.map((s) => s.id)).toContain("with-key");
    } finally {
      delete process.env["ECOCLAW_TEST_KEY_ABC"];
    }
  });
});

// ─── buildSkillContext ───────────────────────────────────────────────────────

describe("buildSkillContext", () => {
  it("builds a context string with one skill", () => {
    expect(buildSkillContext(["arxiv"])).toBe(
      "Make sure to use the following skills: 'arxiv'"
    );
  });

  it("builds a context string with multiple skills", () => {
    expect(buildSkillContext(["arxiv", "fred-economics"])).toBe(
      "Make sure to use the following skills: 'arxiv', 'fred-economics'"
    );
  });

  it("returns empty string for empty input", () => {
    expect(buildSkillContext([])).toBe("");
  });
});

// ─── listByokKeys ────────────────────────────────────────────────────────────

describe("listByokKeys", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `ecoclaw-byok-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty present/missing when no skills exist", () => {
    const result = listByokKeys(tmpDir);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("reports missing keys", () => {
    setupSkillsDir(tmpDir, {
      "skills/s1/SKILL.md": SKILL_MD("s1", ["MISSING_KEY_12345"]),
    });
    const result = listByokKeys(tmpDir);
    expect(result.missing).toContain("MISSING_KEY_12345");
    expect(result.present).not.toContain("MISSING_KEY_12345");
  });

  it("reports present keys", () => {
    process.env["ECOCLAW_TEST_PRESENT_XYZ"] = "some-value";
    try {
      setupSkillsDir(tmpDir, {
        "skills/s2/SKILL.md": SKILL_MD("s2", ["ECOCLAW_TEST_PRESENT_XYZ"]),
      });
      const result = listByokKeys(tmpDir);
      expect(result.present).toContain("ECOCLAW_TEST_PRESENT_XYZ");
      expect(result.missing).not.toContain("ECOCLAW_TEST_PRESENT_XYZ");
    } finally {
      delete process.env["ECOCLAW_TEST_PRESENT_XYZ"];
    }
  });

  it("deduplicates keys shared by multiple skills", () => {
    setupSkillsDir(tmpDir, {
      "skills/a/SKILL.md": SKILL_MD("a", ["SHARED_KEY_DEDUP"]),
      "skills/b/SKILL.md": SKILL_MD("b", ["SHARED_KEY_DEDUP"]),
    });
    const result = listByokKeys(tmpDir);
    const allKeys = [...result.present, ...result.missing];
    const count = allKeys.filter((k) => k === "SHARED_KEY_DEDUP").length;
    expect(count).toBe(1);
  });
});
