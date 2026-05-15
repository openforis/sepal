const fs = require('fs')
const path = require('path')

function loadPromptFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8')
    if (!content.trim()) {
        throw new Error(`LLM prompt asset is empty: ${filePath}`)
    }
    return content
}

function loadPrompt(name) {
    return loadPromptFile(path.join(__dirname, 'assistants', `${name}.md`))
}

function mainSystemPrompt() {
    return loadPrompt('main')
}

function titleSystemPrompt() {
    return loadPrompt('title')
}

module.exports = {loadPromptFile, loadPrompt, mainSystemPrompt, titleSystemPrompt}
