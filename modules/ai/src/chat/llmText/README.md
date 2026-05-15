# LLM-facing text assets

Project source for prompts fed to LLM roles in this module. Loaded at runtime by `prompts.js`; treat each file as production source, not docs.

## Layout

- `<role>.md` at the top level — system prompt for a top-level role: the main user-facing agent (`main.md`) and the title-generator utility (`title.md`).
- `specialists/<name>.md` — system prompt for a delegated specialist (read-only `map.md`; future specialists land here). Matches the code path `src/chat/specialists/`.
- `shared/` (added on demand) — text reused across roles. Introduce only when a real second consumer exists; cross-role copy first.

## What does not live here

- **Tool descriptions/schemas** — stay next to the tool definition (`chat/tools/recipeTools.js`, `chat/tools/mapTools.js`, etc.) so the description and JSON schema are reviewed together.
- **Runtime context wrappers** (e.g. turn-context message text) — stay next to the code that builds them.
- **Provider-specific transforms** (no-think suffix, message preambles, etc.) — stay in the adapter or in the generator that consumes the prompt.

## Loading

`prompts.js` exports `mainSystemPrompt()`, `titleSystemPrompt()`, and `specialistPrompt(name)` — each reads its asset with `fs.readFileSync` and fails fast if the file is empty or missing, so a missing prompt aborts boot rather than silently shipping a blank role.
