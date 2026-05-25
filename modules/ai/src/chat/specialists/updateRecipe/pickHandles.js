// Picker step: one tool-free LLM call that translates the user instruction into
// recipe handles. The picker prompt + recipe handle catalog is the only
// cacheable static slice; the user message is the dynamic instruction. Output
// is a handles-only JSON object — no rationale, no values, no path mechanics.

const {catchError, of, defer} = require('rxjs')
const {map, reduce} = require('rxjs/operators')
const {getRecipeHandles} = require('#recipes')
const {specialistPrompt} = require('../../llmText/prompts')

function pickHandles$({llm, recipeType, instruction, conversationId, recipeName}) {
    const handles = getRecipeHandles(recipeType)
    if (!handles) {
        return of({ok: false, error: {code: 'UNSUPPORTED_RECIPE_TYPE', message: `Recipe type ${recipeType} has no handle catalog`}})
    }
    const allowedNames = new Set(handles.map(handle => handle.name))
    const messages = [
        {role: 'system', content: pickerSystemPromptFromHandles(recipeType, handles)},
        {role: 'user', content: buildUserText({instruction, recipeName, recipeType})}
    ]
    return defer(() => llm.respondTo$({
        messages,
        tools: [],
        debugLabel: `picker ${recipeType}`,
        usageContext: {role: 'picker', recipeType, conversationId}
    })).pipe(
        reduce((text, event) => text + (event.textDelta || ''), ''),
        map(text => parsePickerOutput(text, allowedNames)),
        catchError(error => of({ok: false, error: {code: 'PICKER_FAILED', message: error.message}}))
    )
}

function buildUserText({instruction, recipeName, recipeType}) {
    const lines = [`recipeType: ${recipeType}`]
    if (recipeName) lines.push(`recipeName: ${recipeName}`)
    lines.push(`instruction: ${instruction}`)
    return lines.join('\n')
}

function parsePickerOutput(text, allowedNames) {
    const json = extractJson(text)
    if (!json) return {ok: false, error: {code: 'PICKER_PARSE_FAILED', message: 'Picker output did not contain a JSON object.'}}
    const raw = Array.isArray(json.handles) ? json.handles : null
    if (!raw) return {ok: false, error: {code: 'PICKER_PARSE_FAILED', message: 'Picker output missing handles array.'}}
    const filtered = []
    const seen = new Set()
    for (const name of raw) {
        if (typeof name !== 'string') continue
        if (!allowedNames.has(name)) continue
        if (seen.has(name)) continue
        seen.add(name)
        filtered.push(name)
    }
    if (!filtered.length) {
        return {ok: false, error: {code: 'PICKER_EMPTY', message: 'Picker produced no recognised handle.'}}
    }
    return {ok: true, handles: filtered}
}

// Find a JSON object in possibly fenced or prose-wrapped text. Strips ```json
// fences first, then scans for a balanced {...} block and JSON-parses it.
function extractJson(text) {
    const stripped = text.replace(/```json/g, '').replace(/```/g, '')
    const start = stripped.indexOf('{')
    if (start < 0) return null
    let depth = 0
    let inString = false
    let escape = false
    for (let i = start; i < stripped.length; i++) {
        const ch = stripped[i]
        if (escape) { escape = false; continue }
        if (ch === '\\' && inString) { escape = true; continue }
        if (ch === '"') { inString = !inString; continue }
        if (inString) continue
        if (ch === '{') depth++
        else if (ch === '}') {
            depth--
            if (depth === 0) {
                try { return JSON.parse(stripped.slice(start, i + 1)) } catch { return null }
            }
        }
    }
    return null
}

function pickerSystemPrompt(recipeType) {
    const handles = getRecipeHandles(recipeType)
    if (!handles) return ''
    return pickerSystemPromptFromHandles(recipeType, handles)
}

function pickerSystemPromptFromHandles(recipeType, handles) {
    return [
        specialistPrompt('pickHandles'),
        '',
        `Recipe type: ${recipeType}`,
        '',
        'Handle catalog (handle: description / valueGuidance):',
        ...handles.map(renderHandleEntry)
    ].join('\n')
}

function renderHandleEntry(handle) {
    const parts = [`- ${handle.name}: ${handle.description}`]
    if (handle.valueGuidance) parts.push(`  values: ${handle.valueGuidance}`)
    return parts.join('\n')
}

module.exports = {pickHandles$, pickerSystemPrompt}
