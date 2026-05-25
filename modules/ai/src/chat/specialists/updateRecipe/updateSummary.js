// Fallback summarizer: one tool-free, reasoning-disabled LLM call that
// narrates a successful update in user-facing prose when the specialist's own
// final answer was empty. Local thinking models routinely emit reasoning then
// end the turn with no visible text after a successful tool call; without this
// pass the user would see the deterministic "Updated N handle" string.
//
// Fed only handle-keyed outcome data — appliedHandles, appliedValues, the
// per-handle descriptions from the prepared packet, and the dependency /
// validation context. No JSON Pointer, no operation count.

const {catchError, defer, of} = require('rxjs')
const {reduce} = require('rxjs/operators')
const {updateSummarySystemPrompt} = require('../../llmText/prompts')

function summarizeUpdate$({llm, conversationId, recipeId, instruction, recipeType, recipeName, outcome, packet}) {
    return defer(() => llm.respondTo$({
        messages: buildSummaryMessages({instruction, recipeType, recipeName, outcome, packet}),
        tools: [],
        disableReasoning: true,
        debugLabel: `update.summary ${recipeId}`,
        usageContext: {role: 'update.summary', conversationId, recipeId}
    })).pipe(
        reduce((text, event) => text + (event.textDelta || ''), ''),
        catchError(() => of(''))
    )
}

function buildSummaryMessages({instruction, recipeType, recipeName, outcome, packet}) {
    return [
        {role: 'system', content: updateSummarySystemPrompt()},
        {role: 'user', content: buildSummaryUserText({instruction, recipeType, recipeName, outcome, packet})}
    ]
}

function buildSummaryUserText({instruction, recipeType, recipeName, outcome, packet}) {
    return summaryLines({instruction, recipeType, recipeName, outcome, packet})
        .filter(line => line !== null)
        .join('\n')
}

function summaryLines({instruction, recipeType, recipeName, outcome, packet}) {
    return [
        instruction && `userRequest: ${instruction}`,
        recipeType && `recipeType: ${recipeType}`,
        recipeName && `recipeName: ${recipeName}`,
        outcome.appliedHandles?.length && `appliedHandles: ${JSON.stringify(outcome.appliedHandles)}`,
        anyKey(outcome.appliedValues) && `appliedValues: ${JSON.stringify(outcome.appliedValues)}`,
        fieldDescriptionsLine(outcome.appliedHandles, packet?.fields),
        outcome.invalidatedHandles?.length && `invalidatedHandles: ${JSON.stringify(outcome.invalidatedHandles)}`,
        packet?.dependencyFacts?.length && `dependencyFacts: ${JSON.stringify(packet.dependencyFacts)}`,
        packet?.validationRules?.length && `validationRules: ${JSON.stringify(packet.validationRules)}`
    ].map(line => line || null)
}

function fieldDescriptionsLine(appliedHandles, fields) {
    if (!fields) return null
    const descriptions = Object.fromEntries(
        (appliedHandles || [])
            .filter(handle => fields[handle])
            .map(handle => [handle, fields[handle].description])
    )
    if (!anyKey(descriptions)) return null
    return `fieldDescriptions: ${JSON.stringify(descriptions)}`
}

function anyKey(object) {
    return object && Object.keys(object).length > 0
}

module.exports = {summarizeUpdate$}
