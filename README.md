# ecoclaw-mcp

**Your AI setup, owned by you, forever. No subscriptions, no billing, no ongoing relationship required.**

This is the core MCP server installed on every EcoFiClaw customer's machine during in-person setup. After that one day, EcoFiClaw is out of the picture. Your skills live on your machine, they get smarter over time, and you own everything.

---

## What this is

EcoFiClaw sets you up with a bundle of AI skills tailored to your business — real estate listing writers, market analysis tools, executive productivity helpers, and more. Those skills are installed locally as simple markdown files in `~/.claude/skills/`.

This MCP server is the brain that connects those skills to Claude Desktop. It gives you 6 things you can do with your skills — and crucially, it lets you teach your skills to work the way *you* work.

**Your skills get smarter the more you use them** — because whenever something isn't quite right, you can tell Claude to fix it, and it stays fixed permanently. That's the homomorphic part: your software reshapes itself based on your feedback.

---

## The 6 things you can do

### 1. See what skills you have

```
list_skills
```

Shows everything installed, which version, where it came from, and whether you've customized it. A ✏️ means you have a local modification that overrides the original.

### 2. Use a skill right now

```
run_skill({ name: "listing-writer" })
```

Loads the skill's full instructions into your Claude conversation so Claude knows exactly what to do. Always uses your customized version if you have one.

### 3. Permanently improve a skill

```
tune_skill({ name: "listing-writer", feedback: "always end with a P.S. that mentions the neighborhood's walkability" })
```

This is the powerful one. You tell Claude what's not working, and it rewrites the skill's instructions to fix it — permanently, locally, on your machine. The original version is never touched. Next time you use the skill, your version is used automatically.

Examples of feedback that works:
- *"use a more casual, conversational tone"*
- *"never mention specific competitor agencies"*
- *"always include a social media caption at the end"*
- *"add a section for first-time buyers explaining the process"*

### 4. Create a specialist variant

```
fork_skill({ name: "listing-writer", fork_name: "listing-writer-luxury" })
```

Creates an independent copy under a new name. Good when you want `listing-writer` for standard properties AND `listing-writer-luxury` for high-end ones — completely separate, each improvable on its own.

### 5. Share an improvement with the community

```
contribute({ name: "listing-writer", description: "Added neighborhood walkability P.S. — useful for urban markets" })
```

If you've improved a skill and think it'd help other agents, this submits a pull request to the upstream repository. Uses the `gh` CLI installed during setup. Completely optional — you choose what and when to share. The diff is shown before anything is submitted.

### 6. Keep skills up to date

```
update_skills
```

Pulls the latest versions of all installed skills from npm. **Skills you've customized are automatically skipped** — your tuning is never overwritten. You see exactly what updated and what was preserved.

---

## How customization works (the homomorphic concept)

Every skill is a markdown file (`SKILL.md`) that tells Claude how to behave — what tone to use, what steps to follow, what to include in outputs. When you `tune_skill`, Claude reads that file and rewrites it to incorporate your feedback.

The original file in `~/.claude/skills/` is never touched. Your modified version goes into `~/.ecoclaw/skills/`. When you use a skill, your version takes priority.

This means:
- Your customizations are durable — they survive npm updates
- You can always see what changed (it's just a text file)
- You can roll back by deleting your local version
- You can contribute improvements back to the community

It's software that reshapes itself. Your stack, your way.

---

## Your files, your data

Everything lives in two places on your machine:

```
~/.claude/skills/          # npm-installed skills (managed by npx)
  listing-writer/
    SKILL.md

~/.ecoclaw/                # your stuff (managed by this MCP)
  skills/
    listing-writer/
      SKILL.md             # your customized version (overrides above)
    listing-writer-luxury/
      SKILL.md             # your fork
  config.json              # install record: packages, profile, skill metadata
  history.jsonl            # log of every tune operation
```

Nothing is sent to EcoFiClaw servers. The only network activity is:
- `tune_skill` calls the Anthropic API (same as Claude Desktop itself)
- `contribute` submits a GitHub PR if you explicitly ask for it
- `update_skills` fetches npm packages if you explicitly ask for it

You own these files. Back them up, put them in git, move them to a new machine — they're yours forever.

---

## Contributing back

If you've improved a skill through `tune_skill` and think your change would help other agents in your area, run `contribute`. It:

1. Shows you the diff between your version and the original
2. Submits a pull request to the upstream skill repository
3. The EcoFiClaw community reviews and, if it's good, releases it to everyone

You're not required to contribute anything. But if you do, you make the whole system better for everyone who comes after you.

---

## Getting support

Email: root@ecoficlaw.com

The software is designed to handle most things itself. If something feels off — a skill not doing what you expect, a tune not sticking — try `tune_skill` again with more specific feedback. Claude is pretty good at understanding what you want.

If you're stuck, reach out. We set this up for you in person and we're happy to help.

---

## Claude Desktop config

Add this to your Claude Desktop settings (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "ecoclaw": {
      "command": "npx",
      "args": ["-y", "@ecoclaw/mcp"],
      "env": {}
    }
  }
}
```

---

## License

MIT. You own this software. Do what you want with it.
