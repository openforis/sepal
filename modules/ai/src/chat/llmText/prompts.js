// Loader for project prompt assets. Fails fast on missing or empty
// files.

import fs from 'fs'
import path from 'path'

import {dirName} from '#sepal/path'

const __dirname = dirName(import.meta.url)

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

function emptyAfterToolHint() {
    return loadPrompt('emptyAfterToolHint')
}

function updateSummarySystemPrompt() {
    return loadPrompt('updateSummary')
}

export {emptyAfterToolHint, loadPrompt, loadPromptFile, mainSystemPrompt, specialistPrompt, titleSystemPrompt, updateSummarySystemPrompt}
