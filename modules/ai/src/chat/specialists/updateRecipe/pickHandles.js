const {catchError, of, defer} = require('rxjs')
const {map, reduce, tap} = require('rxjs/operators')
const {getRecipeHandles} = require('#recipes')
const {specialistPrompt} = require('../../llmText/prompts')
const {publishPickHandlesCompleted} = require('../recipeFlowEvents')

const PICKER_MAX_TOKENS = 512

// `flow` tags both the LLM usage role ('{flow}.picker') and the published
// completion event type ('{flow}_recipe.picker.completed') so observability
// rolls up by workflow even though the picker logic is shared.
// `allowEmpty` lets create accept a picker that returned no handles — the
// workflow proceeds to prepare, which always pulls user-required handles
// into the writable set.
// Accepts `{request, context}` (preferred) and legacy `{instruction}` as a
// fallback for callers/tests not yet migrated. `context` is neutral prose,
// labelled distinctly so the picker doesn't treat it as instructions.
function pickHandles$({llm, bus, recipeType, request, context, instruction, conversationId, recipeName, flow = 'update', allowEmpty = false}) {
    const handles = getRecipeHandles(recipeType)
    if (!handles) {
        return of({ok: false, error: {code: 'UNSUPPORTED_RECIPE_TYPE', message: `Recipe type ${recipeType} has no handle catalog`}})
    }
    const allowedNames = new Set(handles.map(handle => handle.name))
    const userRequest = request ?? instruction
    const messages = [
        {role: 'system', content: pickerSystemPromptFromHandles(recipeType, handles)},
        {role: 'user', content: buildUserText({request: userRequest, context, recipeName, recipeType})}
    ]
    return defer(() => llm.respondTo$({
        messages,
        tools: [],
        maxTokens: PICKER_MAX_TOKENS,
        disableReasoning: true,
        debugLabel: `picker ${recipeType}`,
        usageContext: {role: `${flow}.picker`, recipeType, conversationId}
    })).pipe(
        reduce((text, event) => text + (event.textDelta || ''), ''),
        map(text => parsePickerOutput(text, allowedNames, {allowEmpty})),
        tap(result => publishOnSuccess({bus, conversationId, recipeType, result, flow})),
        catchError(error => of({ok: false, error: {code: 'PICKER_FAILED', message: error.message}}))
    )
}

function publishOnSuccess({bus, conversationId, recipeType, result, flow}) {
    if (!bus || !result?.ok) return
    publishPickHandlesCompleted({bus, conversationId, recipeType, pickedHandles: result.handles, flow})
}

function buildUserText({request, context, recipeName, recipeType}) {
    const lines = [`recipeType: ${recipeType}`]
    if (recipeName) lines.push(`recipeName: ${recipeName}`)
    lines.push(`request: ${request ?? ''}`)
    if (context && context.trim()) lines.push(`context: ${context}`)
    return lines.join('\n')
}

function parsePickerOutput(text, allowedNames, {allowEmpty = false} = {}) {
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
    if (!filtered.length && !allowEmpty) {
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
        'Handle catalog (handle | label | description; performance note where it matters):',
        ...handles.map(renderHandleEntry)
    ].join('\n')
}

function renderHandleEntry(handle) {
    const parts = [`- ${handle.name} | ${handle.label} | ${handle.description}`]
    if (handle.selectionGuidance) parts.push(`  selection: ${handle.selectionGuidance}`)
    if (handle.performanceNote) parts.push(`  performance: ${handle.performanceNote}`)
    return parts.join('\n')
}

module.exports = {pickHandles$, pickerSystemPrompt}
