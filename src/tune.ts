import Anthropic from "@anthropic-ai/sdk";
import { readSkill, writeUserSkill, markCustomized } from "./skills.js";
import { appendHistorySync } from "./config.js";

export interface TuneResult {
  original: string;
  modified: string;
  saved: boolean;
  change_summary: string;
}

const TUNE_SYSTEM = `You are a skill prompt engineer. You receive a SKILL.md file and feedback from a user, and your job is to modify the SKILL.md to incorporate the feedback.

Rules:
- Preserve the overall structure and intent of the skill
- Apply only the changes implied by the feedback — don't rewrite everything
- Keep tone, format, and workflow steps unless the feedback targets them
- Return ONLY the modified SKILL.md content — no preamble, no explanation, no markdown fences
- The output must be a complete, valid SKILL.md ready to save and use`;

/**
 * Apply user feedback to a skill's SKILL.md using Claude.
 * Saves the result to ~/.ecoclaw/skills/{name}/SKILL.md.
 */
export async function tuneSkill(
  name: string,
  feedback: string
): Promise<TuneResult> {
  const { content: original } = readSkill(name);

  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: TUNE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Here is the current SKILL.md for "${name}":\n\n${original}\n\n---\n\nUser feedback to apply:\n${feedback}\n\nReturn the complete modified SKILL.md.`,
      },
    ],
  });

  const modified = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("")
    .trim();

  const savedPath = writeUserSkill(name, modified);
  markCustomized(name, savedPath);

  appendHistorySync({
    op: "tune",
    skill: name,
    feedback,
    original_length: original.length,
    modified_length: modified.length,
  });

  // Generate a brief diff summary
  const origLines = original.split("\n").length;
  const modLines = modified.split("\n").length;
  const delta = modLines - origLines;
  const deltaStr =
    delta === 0 ? "same length" : delta > 0 ? `+${delta} lines` : `${delta} lines`;
  const change_summary = `Applied feedback to "${name}": ${deltaStr}. Saved to ~/.ecoclaw/skills/${name}/SKILL.md`;

  return { original, modified, saved: true, change_summary };
}
