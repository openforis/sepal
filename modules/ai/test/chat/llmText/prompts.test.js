const fs = require('fs')
const os = require('os')
const path = require('path')

const {loadPromptFile, mainSystemPrompt, specialistPrompt, titleSystemPrompt, updateSummarySystemPrompt} = require('#mcp/chat/llmText/prompts')

describe('llmText prompts', () => {

    describe('loadPromptFile', () => {

        it('returns the file contents when the asset has text', () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompts-loadOk-'))
            const file = path.join(dir, 'role.md')
            fs.writeFileSync(file, 'Hello.\n')

            try {
                expect(loadPromptFile(file)).toBe('Hello.\n')
            } finally {
                fs.rmSync(dir, {recursive: true, force: true})
            }
        })

        it('throws when the asset is empty so a missing prompt fails to boot', () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompts-loadEmpty-'))
            const file = path.join(dir, 'blank.md')
            fs.writeFileSync(file, '   \n\n')

            try {
                expect(() => loadPromptFile(file)).toThrow(/empty/i)
            } finally {
                fs.rmSync(dir, {recursive: true, force: true})
            }
        })

        it('throws when the asset file does not exist', () => {
            expect(() => loadPromptFile('/nonexistent/role.md')).toThrow()
        })
    })

    describe('mainSystemPrompt', () => {
        const mainAsset = path.join(__dirname, '../../../src/chat/llmText/main.md')

        it('loads the main agent prompt from llmText/main.md', () => {
            expect(mainSystemPrompt()).toBe(fs.readFileSync(mainAsset, 'utf8'))
        })

        it('returns the real prompt rather than a short placeholder', () => {
            expect(mainSystemPrompt()).toContain('Sepalito')
        })

        it('has no dynamic placeholders so it stays byte-stable across users and GUI state', () => {
            const prompt = mainSystemPrompt()
            expect(prompt).not.toMatch(/\{\{.*?\}\}/)
        })

        it('carries the direct-update routing rule so the orchestrator goes to update_recipe without pre-inspecting via describe_recipe', () => {
            const prompt = mainSystemPrompt()
            expect(prompt).toMatch(/update_recipe/)
            expect(prompt).toMatch(/do not preflight.*describe_recipe/i)
            expect(prompt).toMatch(/problem reports paired with action/i)
        })
    })

    describe('titleSystemPrompt', () => {
        const titleAsset = path.join(__dirname, '../../../src/chat/llmText/title.md')

        it('loads the title-generator prompt from llmText/title.md', () => {
            expect(titleSystemPrompt()).toBe(fs.readFileSync(titleAsset, 'utf8'))
        })

        it('carries the bare-title instruction so callers do not need to know its content', () => {
            expect(titleSystemPrompt()).toMatch(/3-7 word title/i)
        })
    })

    describe('updateSummarySystemPrompt', () => {

        it('teaches the fallback summarizer to lead with user-intent changes and demote validation companions', () => {
            const prompt = updateSummarySystemPrompt()

            expect(prompt).toMatch(/applied changes/i)
            expect(prompt).toMatch(/directly satisfy userRequest/i)
            expect(prompt).toMatch(/validation\/applicability companion/i)
            expect(prompt).toMatch(/unchanged defaults.*context fields.*validation companions/i)
        })
    })

    describe('specialistPrompt', () => {
        const mapAsset = path.join(__dirname, '../../../src/chat/llmText/specialists/map.md')

        it('loads a specialist prompt by name from llmText/specialists/${name}.md', () => {
            expect(specialistPrompt('map')).toBe(fs.readFileSync(mapAsset, 'utf8'))
        })

        it('throws when the named specialist asset does not exist', () => {
            expect(() => specialistPrompt('nonexistent-specialist')).toThrow()
        })

        it('the picker prompt instructs handles-only output with no values, no tool calls, no rationale', () => {
            const prompt = specialistPrompt('pickHandles')
            expect(prompt).toMatch(/{"handles":\[/)
            expect(prompt).toMatch(/do not pick values/i)
            expect(prompt).toMatch(/do not call tools/i)
        })

        it('the handle-based updater prompt names the update_recipe_values tool and writableHandles boundary', () => {
            const prompt = specialistPrompt('updateHandles')
            expect(prompt).toMatch(/update_recipe_values/)
            expect(prompt).toMatch(/writableHandles/)
        })

        // The LLM-facing tool schema is narrowed to {recipeId, values}; the
        // prompt must match that contract, not say "pass baseModelHash" or
        // "pass writableHandles" — those are workflow-managed.
        it('the updater prompt does not instruct the model to pass workflow-bound fields in the tool call', () => {
            const prompt = specialistPrompt('updateHandles')
            expect(prompt).not.toMatch(/pass.*baseModelHash/i)
            expect(prompt).not.toMatch(/pass.*writableHandles/i)
            expect(prompt).not.toMatch(/use.*writableHandles.*in the call/i)
        })
    })
})
