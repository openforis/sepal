const fs = require('fs')
const path = require('path')

describe('system prompt', () => {
    const prompt = fs.readFileSync(
        path.join(__dirname, '../../src/chat/system-prompt.md'),
        'utf8'
    )

    it('has no dynamic placeholders so it stays byte-stable across users and GUI state', () => {
        expect(prompt).not.toContain('{{username}}')
        expect(prompt).not.toContain('{{currentContext}}')
        expect(prompt).not.toContain('{{recipeTypes}}')
        expect(prompt).not.toMatch(/\{\{.*?\}\}/)
    })
})
