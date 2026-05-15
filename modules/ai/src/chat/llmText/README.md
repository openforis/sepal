# LLM-facing text assets

Project source for prompts fed to LLM roles in this module. Loaded at runtime by `prompts.js`; treat each file as production source, not docs.

## Layout

- `assistants/<role>.md` — full system prompt for one assistant role (e.g. `main.md`, `title.md`). Markdown, telegraphic per the module's LLM-facing style rules, no runtime placeholders.
- `shared/` (added on demand) — text reused across roles. Introduce only when a real second consumer exists; cross-role copy first.

## What does not live here

- **Tool descriptions/schemas** — stay next to the tool definition (`chat/sendMessage/productTools.js` etc.) so the description and JSON schema are reviewed together.
- **Runtime context wrappers** (e.g. turn-context message text) — stay next to the code that builds them.
- **Provider-specific transforms** (no-think suffix, message preambles, etc.) — stay in the adapter or in the generator that consumes the prompt.

## Loading

`prompts.js` reads each asset with `fs.readFileSync` at first use. An empty or missing file fails fast so a missing prompt aborts boot rather than silently shipping a blank assistant.
