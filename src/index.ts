#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

import {
  listSkills,
  readSkill,
  forkSkill,
} from "./skills.js";
import { tuneSkill } from "./tune.js";
import { contributeSkill } from "./contribute.js";
import {
  readConfig,
  writeConfig,
  CLAUDE_SKILLS_DIR,
  ECOCLAW_SKILLS_DIR,
  appendHistorySync,
} from "./config.js";

const server = new Server(
  { name: "ecoclaw", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// ─── Tool definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_skills",
      description:
        "List all installed skills — both npm-installed (~/.claude/skills/) and your local customizations (~/.ecoclaw/skills/). Shows name, version, source, and whether you've customized it.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "run_skill",
      description:
        "Get the full prompt/instructions for a skill so Claude can use it inline. Checks your user-local version first (~/.ecoclaw/skills/), then falls back to the npm-installed version.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name (e.g. listing-writer)" },
          context: {
            type: "string",
            description: "Optional context about what you want to do with this skill",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "tune_skill",
      description:
        "Apply plain-language feedback to a skill, permanently modifying how it works for you. This is the homomorphic heart — your feedback gets written into the skill's prompt and saved locally. The original npm version is never touched. Examples: 'always use a more casual tone', 'end every output with a P.S.', 'never mention competitors'.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name to tune" },
          feedback: {
            type: "string",
            description:
              "Plain-language description of how you want the skill to change",
          },
        },
        required: ["name", "feedback"],
      },
    },
    {
      name: "fork_skill",
      description:
        "Create an independent copy of a skill under a new name. Use this when you want a specialized variant (e.g. listing-writer-luxury) while keeping the original unchanged. Both versions appear in list_skills.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Source skill to fork" },
          fork_name: {
            type: "string",
            description:
              "Name for the fork (default: {name}-custom). Use something descriptive like listing-writer-luxury.",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "contribute",
      description:
        "Share a skill improvement back to the community by submitting a GitHub PR to the upstream repo. Shows you the diff first. Uses the gh CLI (installed during EcoFiClaw setup). Completely optional — you choose when and what to share.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill to contribute" },
          description: {
            type: "string",
            description: "Explain what you changed and why it helps others",
          },
        },
        required: ["name", "description"],
      },
    },
    {
      name: "update_skills",
      description:
        "Pull the latest npm versions of all installed skills. Skills with local customizations are skipped to protect your tuning — you'll see exactly what was updated and what was preserved.",
      inputSchema: {
        type: "object",
        properties: {
          skill: {
            type: "string",
            description:
              "Update only this skill (optional). Omit to update all skills.",
          },
        },
        required: [],
      },
    },
  ],
}));

// ─── Tool implementations ────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_skills": {
        const skills = listSkills();
        if (skills.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No skills installed yet.\n\nInstall skills with: npx @gonzih/skills-realestate (or any @gonzih/skills-* package)\nThey land in ~/.claude/skills/ and appear here automatically.",
              },
            ],
          };
        }
        const lines = [
          `Found ${skills.length} skill${skills.length === 1 ? "" : "s"}:\n`,
          ...skills.map(
            (s) =>
              `• ${s.name}${s.customized ? " ✏️" : ""}\n  version: ${s.version} | source: ${s.source}\n  ${s.description}`
          ),
          "\n✏️ = you have a local customization",
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      case "run_skill": {
        const skillName = (args as { name: string; context?: string }).name;
        const context = (args as { name: string; context?: string }).context;
        const { content, source, path } = readSkill(skillName);

        const note =
          source === "user"
            ? `Using your customized version (~/.ecoclaw/skills/${skillName}/SKILL.md)`
            : `Using installed version (~/.claude/skills/${skillName}/SKILL.md)`;

        const response = [
          `## Skill: ${skillName}`,
          `_${note}_`,
          "",
          content,
          context ? `\n---\n**Your context:** ${context}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        return { content: [{ type: "text", text: response }] };
      }

      case "tune_skill": {
        const { name: skillName, feedback } = args as {
          name: string;
          feedback: string;
        };
        const result = await tuneSkill(skillName, feedback);

        const response = [
          `## Tuned: ${skillName}`,
          `**Feedback applied:** ${feedback}`,
          "",
          result.change_summary,
          "",
          "### What changed",
          "**Before (excerpt):**",
          "```",
          result.original.slice(0, 400) + (result.original.length > 400 ? "\n..." : ""),
          "```",
          "**After (excerpt):**",
          "```",
          result.modified.slice(0, 400) + (result.modified.length > 400 ? "\n..." : ""),
          "```",
          "",
          `Saved to: ~/.ecoclaw/skills/${skillName}/SKILL.md`,
          "Next time you use this skill, your version will be used automatically.",
        ].join("\n");

        return { content: [{ type: "text", text: response }] };
      }

      case "fork_skill": {
        const { name: skillName, fork_name } = args as {
          name: string;
          fork_name?: string;
        };
        const result = forkSkill(skillName, fork_name);

        return {
          content: [
            {
              type: "text",
              text: [
                `## Forked: ${skillName} → ${result.forkedAs}`,
                "",
                result.message,
                `Location: ${result.location}`,
                "",
                `Use \`run_skill\` with name "${result.forkedAs}" to invoke your fork.`,
                `Use \`tune_skill\` with name "${result.forkedAs}" to customize it independently.`,
              ].join("\n"),
            },
          ],
        };
      }

      case "contribute": {
        const { name: skillName, description } = args as {
          name: string;
          description: string;
        };
        const result = await contributeSkill(skillName, description);

        const lines = [
          `## Contribute: ${skillName}`,
          "",
          "### Diff",
          "```diff",
          result.diff || "(no diff available)",
          "```",
          "",
          result.pr_url ? `**PR:** ${result.pr_url}` : "",
          result.message,
        ].filter((l) => l !== undefined);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      case "update_skills": {
        const { skill: targetSkill } = (args as { skill?: string }) ?? {};
        const config = readConfig();
        const updated: string[] = [];
        const skipped: string[] = [];

        // Find installed npm packages
        const packages = config.profile.packages;
        if (packages.length === 0 && !targetSkill) {
          return {
            content: [
              {
                type: "text",
                text: "No skill packages recorded in ~/.ecoclaw/config.json. Run ecoclaw-setup to re-register installed packages.",
              },
            ],
          };
        }

        const skillsToUpdate = targetSkill
          ? [targetSkill]
          : (() => {
              if (!existsSync(CLAUDE_SKILLS_DIR)) return [];
              return readdirSync(CLAUDE_SKILLS_DIR, { withFileTypes: true })
                .filter((e) => e.isDirectory())
                .map((e) => e.name);
            })();

        for (const skillName of skillsToUpdate) {
          const isCustomized = config.skills[skillName]?.customized ?? false;
          if (isCustomized) {
            skipped.push(skillName);
            continue;
          }

          // Attempt npm update for the package that owns this skill
          const source = config.skills[skillName]?.source;
          if (source && source.startsWith("@")) {
            try {
              execSync(`npx ${source} --yes`, { stdio: "pipe" });
              updated.push(skillName);
            } catch {
              skipped.push(`${skillName} (update failed)`);
            }
          } else {
            skipped.push(`${skillName} (source unknown, skipping)`);
          }
        }

        appendHistorySync({ op: "update", updated, skipped });

        const lines = [
          "## Skills update",
          updated.length > 0
            ? `\n**Updated (${updated.length}):** ${updated.join(", ")}`
            : "\n**Updated:** none",
          skipped.length > 0
            ? `\n**Skipped (${skipped.length}):** ${skipped.join(", ")}\n_Skills with local customizations are never auto-updated._`
            : "",
        ].filter(Boolean);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
