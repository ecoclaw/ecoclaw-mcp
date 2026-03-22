import { execSync } from "child_process";
import { readSkill, npmSkillPath } from "./skills.js";
import { readConfig } from "./config.js";

export interface ContributeResult {
  diff: string;
  pr_url?: string;
  message: string;
}

/**
 * Compute a line-by-line diff between original and modified SKILL.md.
 * Returns a simple unified-style diff summary.
 */
function computeDiff(original: string, modified: string): string {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");

  const removed = origLines
    .filter((l) => !modLines.includes(l))
    .map((l) => `- ${l}`);
  const added = modLines
    .filter((l) => !origLines.includes(l))
    .map((l) => `+ ${l}`);

  if (removed.length === 0 && added.length === 0) return "(no changes)";
  return [...removed, ...added].join("\n");
}

/**
 * Contribute a customized skill back to upstream via a GitHub PR.
 * Requires `gh` CLI to be installed (set up during EcoFiClaw install).
 */
export async function contributeSkill(
  name: string,
  description: string
): Promise<ContributeResult> {
  // Verify gh CLI is available
  try {
    execSync("gh --version", { stdio: "pipe" });
  } catch {
    return {
      diff: "",
      message:
        "GitHub CLI (gh) is not installed. Run `brew install gh` and authenticate with `gh auth login`.",
    };
  }

  // Read user-customized version
  let userContent: string;
  try {
    const result = readSkill(name);
    if (result.source !== "user") {
      return {
        diff: "",
        message: `Skill "${name}" has no local customizations to contribute.`,
      };
    }
    userContent = result.content;
  } catch (err) {
    return {
      diff: "",
      message: `Could not read skill "${name}": ${(err as Error).message}`,
    };
  }

  // Read original npm version for diff
  const npmPath = npmSkillPath(name);
  let originalContent = "";
  if (npmPath) {
    try {
      const { readFileSync } = await import("fs");
      originalContent = readFileSync(npmPath, "utf8");
    } catch {
      originalContent = "";
    }
  }

  const diff = computeDiff(originalContent, userContent);

  // Determine which repo to contribute to based on config
  const config = readConfig();
  const skillConfig = config.skills[name];
  const source = skillConfig?.source ?? "";
  // Extract org/repo from npm package name like @gonzih/skills-realestate
  let upstreamRepo = "gonzih/skills-ecoclaw"; // default fallback
  if (source.startsWith("@")) {
    const pkg = source.replace("@", "").replace("/", "/");
    upstreamRepo = pkg;
  }

  // Create PR via gh CLI
  try {
    // Fork and clone approach using gh — simplest for a CLI-based workflow
    const prBody = [
      `## Skill improvement: ${name}`,
      "",
      description,
      "",
      "## Changes",
      "```diff",
      diff.slice(0, 3000), // cap diff length in PR body
      "```",
      "",
      "Contributed via EcoFiClaw `contribute` tool.",
    ].join("\n");

    const prUrl = execSync(
      `gh pr create --repo "${upstreamRepo}" --title "improve(${name}): ${description.slice(0, 60)}" --body ${JSON.stringify(prBody)}`,
      { encoding: "utf8", stdio: "pipe" }
    ).trim();

    return {
      diff,
      pr_url: prUrl,
      message: `PR submitted to ${upstreamRepo}. Thank you for contributing! ${prUrl}`,
    };
  } catch (err) {
    const errMsg = (err as Error).message;
    return {
      diff,
      message: `Diff computed (see above). Could not auto-submit PR: ${errMsg}\n\nYou can manually submit the diff to the upstream repo.`,
    };
  }
}
