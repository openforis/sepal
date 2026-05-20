// Bus event publishers for the specialist runtime. Compact summaries at
// DEBUG (per-round lifecycle) and INFO (update outcome). Per-call shape
// summarisers stay narrow — prepare_update and recipe_patch get bespoke
// strings; everything else falls back to a generic kind label so
// new tools still publish a usable event without code changes here.

const {publishLoopPrompt} = require('../loopEvents')

function publishSpecialistPrompt({bus, name, round, conversationId, messages, toolSchemas}) {
    publishLoopPrompt({bus, prefix: 'specialist', name, conversationId, round, messages, toolSchemas})
}

function publishSpecialistRequest({bus, name, round, conversationId, messages, toolSchemas}) {
    const messageCount = messages.length
    const toolNames = toolSchemas.map(schema => schema.name)
    bus.publish({
        type: 'specialist.request',
        level: 'debug',
        conversationId,
        name,
        round,
        messageCount,
        toolNames,
        message: `specialist.request name=${name} round=${round} messages=${messageCount} tools=[${toolNames.join(',') || '-'}]`
    })
}

function publishSpecialistStall({bus, name, round, conversationId, stallCount, messageCount, toolNames}) {
    bus.publish({
        type: 'specialist.stall',
        level: 'warn',
        conversationId,
        name,
        round,
        stallCount,
        messageCount,
        toolNames,
        message: `specialist.stall name=${name} round=${round} stallCount=${stallCount} messages=${messageCount} tools=[${toolNames.join(',') || '-'}]`
    })
}

function publishSpecialistResponse({bus, name, round, conversationId, text, toolCalls}) {
    const textChars = (text || '').length
    const toolCallNames = (toolCalls || []).map(toolCall => toolCall.name)
    const empty = textChars === 0 && toolCallNames.length === 0
    bus.publish({
        type: 'specialist.response',
        level: 'debug',
        conversationId,
        name,
        round,
        textChars,
        toolCallNames,
        empty,
        message: `specialist.response name=${name} round=${round} textChars=${textChars} toolCalls=[${toolCallNames.join(',') || '-'}]${empty ? ' empty=true' : ''}`
    })
}

function publishSpecialistToolRequest({bus, name, conversationId, toolCall}) {
    const inputKeys = toolCall?.input && typeof toolCall.input === 'object'
        ? Object.keys(toolCall.input)
        : []
    bus.publish({
        type: 'specialist.tool.request',
        level: 'debug',
        conversationId,
        name,
        tool: toolCall.name,
        inputKeys,
        message: `specialist.tool.request name=${name} tool=${toolCall.name} inputKeys=[${inputKeys.join(',')}]`
    })
}

function publishSpecialistToolResponse({bus, name, conversationId, tool, envelope}) {
    if (envelope?.ok === false) {
        const errorCode = envelope.error?.code || 'unknown'
        bus.publish({
            type: 'specialist.tool.response',
            level: 'debug',
            conversationId,
            name,
            tool,
            ok: false,
            errorCode,
            message: `specialist.tool.response name=${name} tool=${tool} ok=false errorCode=${errorCode}`
        })
        return
    }
    const shape = summariseToolShape(tool, envelope?.data)
    bus.publish({
        type: 'specialist.tool.response',
        level: 'debug',
        conversationId,
        name,
        tool,
        ok: true,
        shape,
        message: `specialist.tool.response name=${name} tool=${tool} ok=true shape=${shape}`
    })
}

function publishUpdateRecipeOutcome({bus, conversationId, recipeId, attempted, succeeded, code, lastPatchErrorCode, answerChars}) {
    bus.publish({
        type: 'update_recipe.outcome',
        level: 'info',
        conversationId,
        recipeId,
        patchAttempted: attempted,
        patchSucceeded: succeeded,
        code,
        lastPatchErrorCode: lastPatchErrorCode || null,
        answerChars,
        message: outcomeMessage({recipeId, attempted, succeeded, code, lastPatchErrorCode, answerChars})
    })
}

function outcomeMessage({recipeId, attempted, succeeded, code, lastPatchErrorCode, answerChars}) {
    const head = `update_recipe.outcome recipeId=${recipeId} patchAttempted=${attempted} patchSucceeded=${succeeded} code=${code}`
    const tail = ` answerChars=${answerChars}`
    return lastPatchErrorCode
        ? `${head} lastPatchErrorCode=${lastPatchErrorCode}${tail}`
        : `${head}${tail}`
}

function summariseToolShape(tool, data) {
    if (tool === 'prepare_update') {
        const focusCount = (data?.focusPaths || []).length
        const dependentCount = (data?.dependentPaths || []).length
        const writableCount = (data?.writablePaths || []).length
        return `prepared(focus=${focusCount},dependent=${dependentCount},writable=${writableCount})`
    }
    if (tool === 'recipe_patch') {
        const modelHash = data?.modelHash || 'unchanged'
        const invalidatedPathsCount = (data?.invalidatedPaths || []).length
        return `patch(modelHash=${modelHash},invalidatedPaths=${invalidatedPathsCount})`
    }
    if (Array.isArray(data)) return `array(${data.length})`
    if (data && typeof data === 'object') return 'object'
    if (data == null) return 'null'
    return typeof data
}

module.exports = {
    publishSpecialistPrompt,
    publishSpecialistRequest,
    publishSpecialistResponse,
    publishSpecialistStall,
    publishSpecialistToolRequest,
    publishSpecialistToolResponse,
    publishUpdateRecipeOutcome
}
