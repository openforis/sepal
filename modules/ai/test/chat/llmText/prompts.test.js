import fs from 'fs'
import os from 'os'
import path from 'path'

import {loadPromptFile, mainSystemPrompt, specialistPrompt, titleSystemPrompt} from '#mcp/chat/llmText/prompts'
import {dirName} from '#sepal/path'

const __dirname = dirName(import.meta.url)

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

        it('has no dynamic placeholders so it stays byte-stable across users and GUI state', () => {
            expect(mainSystemPrompt()).not.toMatch(/\{\{.*?\}\}/)
        })
    })

    describe('titleSystemPrompt', () => {
        const titleAsset = path.join(__dirname, '../../../src/chat/llmText/title.md')

        it('loads the title-generator prompt from llmText/title.md', () => {
            expect(titleSystemPrompt()).toBe(fs.readFileSync(titleAsset, 'utf8'))
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
    })
})
