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
    return loadPromptFile(path.join(__dirname, `${name}.md`))
}

function specialistPrompt(name) {
    return loadPromptFile(path.join(__dirname, 'specialists', `${name}.md`))
}

function mainSystemPrompt() {
    return loadPrompt('main')
}

function titleSystemPrompt() {
    return loadPrompt('title')
}

module.exports = {loadPromptFile, loadPrompt, specialistPrompt, mainSystemPrompt, titleSystemPrompt}
