#!/usr/bin/env node
/**
 * ecoclaw-setup — run once during in-person EcoFiClaw install.
 *
 * Creates ~/.ecoclaw/ directory structure and initializes config.json
 * with the customer's profile. Called by the EcoFiClaw installer.
 *
 * Usage:
 *   npx @ecoclaw/mcp --setup
 *   node setup.js [--name "Maksim"] [--business "Nevada Real Estate LLC"] [--packages "@gonzih/skills-realestate,@gonzih/skills-executive"]
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const ECOCLAW_DIR = join(homedir(), ".ecoclaw");
const ECOCLAW_SKILLS_DIR = join(ECOCLAW_DIR, "skills");
const ECOCLAW_CONFIG_PATH = join(ECOCLAW_DIR, "config.json");

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { name: "", business: "", packages: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) result.name = args[++i];
    if (args[i] === "--business" && args[i + 1]) result.business = args[++i];
    if (args[i] === "--packages" && args[i + 1])
      result.packages = args[++i].split(",").map((p) => p.trim());
  }
  return result;
}

function setup() {
  const { name, business, packages } = parseArgs();

  // Create directory structure
  if (!existsSync(ECOCLAW_DIR)) {
    mkdirSync(ECOCLAW_DIR, { recursive: true });
    console.log(`✓ Created ~/.ecoclaw/`);
  }
  if (!existsSync(ECOCLAW_SKILLS_DIR)) {
    mkdirSync(ECOCLAW_SKILLS_DIR, { recursive: true });
    console.log(`✓ Created ~/.ecoclaw/skills/`);
  }

  // Build config — preserve existing if already set up
  let existing = {};
  if (existsSync(ECOCLAW_CONFIG_PATH)) {
    try {
      existing = JSON.parse(readFileSync(ECOCLAW_CONFIG_PATH, "utf8"));
      console.log(`ℹ  Existing config found — updating profile fields.`);
    } catch {
      // ignore malformed config
    }
  }

  const config = {
    version: "0.1.0",
    installed_at: new Date().toISOString().split("T")[0],
    ...existing,
    profile: {
      name: name || existing?.profile?.name || "",
      business: business || existing?.profile?.business || "",
      packages:
        packages.length > 0
          ? packages
          : existing?.profile?.packages ?? [],
    },
    skills: existing?.skills ?? {},
  };

  writeFileSync(ECOCLAW_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  console.log(`✓ Config written to ~/.ecoclaw/config.json`);

  // Emit Claude Desktop MCP config snippet
  const mcpConfig = {
    mcpServers: {
      ecoclaw: {
        command: "npx",
        args: ["-y", "@ecoclaw/mcp"],
        env: {},
      },
    },
  };

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EcoFiClaw MCP setup complete.

Add this to your Claude Desktop settings → Developer → MCP:

${JSON.stringify(mcpConfig, null, 2)}

Or use the Claude Desktop UI: Settings → Developer → Edit Config
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

setup();
