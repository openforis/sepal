import {catchError, defer, of} from 'rxjs'
import {reduce} from 'rxjs/operators'

import {updateSummarySystemPrompt} from '../../llmText/prompts.js'

// One tool-free, reasoning-disabled LLM call that narrates a successful
// update in user-facing prose when the specialist answered empty. Reads only
// from the prepared packet's per-handle metadata so the summary speaks in
// labels and valueLabels rather than handle names or enum tokens.
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
    const appliedFields = appliedFieldsFor(outcome, packet)
    return summaryLines({instruction, recipeType, recipeName, outcome, packet, appliedFields})
        .filter(line => line !== null)
        .join('\n')
}

// Per-applied-handle metadata for the summarizer: label, the value the
// updater sent, optional valueLabels/summaryGuidance from the packet. Drives
// user-facing prose without forcing the summarizer to read raw enum tokens.
function appliedFieldsFor(outcome, packet) {
    const appliedHandles = outcome.appliedHandles || []
    const fields = packet?.fields || {}
    const result = {}
    for (const handle of appliedHandles) {
        const field = fields[handle]
        if (!field) continue
        result[handle] = {
            label: field.label,
            value: outcome.appliedValues?.[handle],
            ...(field.valueLabels !== undefined ? {valueLabels: field.valueLabels} : {}),
            ...(field.summaryGuidance !== undefined ? {summaryGuidance: field.summaryGuidance} : {})
        }
    }
    return result
}

function summaryLines({instruction, recipeType, recipeName, outcome, packet, appliedFields}) {
    return [
        instruction && `userRequest: ${instruction}`,
        recipeType && `recipeType: ${recipeType}`,
        recipeName && `recipeName: ${recipeName}`,
        outcome.appliedHandles?.length && `appliedHandles: ${JSON.stringify(outcome.appliedHandles)}`,
        anyKey(appliedFields) && `appliedFields: ${JSON.stringify(appliedFields)}`,
        outcome.invalidatedHandles?.length && `invalidatedHandles: ${JSON.stringify(outcome.invalidatedHandles)}`,
        packet?.dependencyFacts?.length && `dependencyFacts: ${JSON.stringify(packet.dependencyFacts)}`,
        packet?.couplingFacts?.length && `couplingFacts: ${JSON.stringify(packet.couplingFacts)}`,
        packet?.validationRules?.length && `validationRules: ${JSON.stringify(packet.validationRules)}`
    ].map(line => line || null)
}

function anyKey(object) {
    return object && Object.keys(object).length > 0
}

export {summarizeUpdate$}
