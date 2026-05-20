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
    const inputSummary = summariseToolInput(toolCall?.name, toolCall?.input)
    bus.publish({
        type: 'specialist.tool.request',
        level: 'debug',
        conversationId,
        name,
        tool: toolCall.name,
        inputKeys,
        inputSummary,
        message: `specialist.tool.request name=${name} tool=${toolCall.name} inputKeys=[${inputKeys.join(',')}]${inputSummary ? ` ${inputSummary}` : ''}`
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

function summariseToolInput(tool, input) {
    if (!input || typeof input !== 'object') return ''
    if (tool === 'prepare_update') {
        return `recipeId=${input.recipeId || '-'} focusPaths=${pathList(input.focusPaths)}`
    }
    if (tool === 'recipe_patch') {
        return [
            `recipeId=${input.recipeId || '-'}`,
            `baseModelHash=${shortHash(input.baseModelHash)}`,
            `ops=${patchOperations(input.operations)}`
        ].join(' ')
    }
    return ''
}

function summariseToolShape(tool, data) {
    if (tool === 'prepare_update') {
        const focusCount = (data?.focusPaths || []).length
        const dependentCount = (data?.dependentPaths || []).length
        const writableCount = (data?.writablePaths || []).length
        return `prepared(focus=${focusCount}${pathList(data?.focusPaths)},dependent=${dependentCount}${pathList(data?.dependentPaths)},writable=${writableCount}${pathList(data?.writablePaths)})`
    }
    if (tool === 'recipe_patch') {
        const modelHash = data?.modelHash || 'unchanged'
        const invalidatedPathsCount = (data?.invalidatedPaths || []).length
        return `patch(modelHash=${shortHash(modelHash)},invalidatedPaths=${invalidatedPathsCount}${pathList(data?.invalidatedPaths)})`
    }
    if (Array.isArray(data)) return `array(${data.length})`
    if (data && typeof data === 'object') return 'object'
    if (data == null) return 'null'
    return typeof data
}

function patchOperations(operations) {
    if (!Array.isArray(operations)) return '[-]'
    const maxOperations = 10
    const head = operations.slice(0, maxOperations).map(patchOperation)
    const suffix = operations.length > maxOperations ? `;+${operations.length - maxOperations}` : ''
    return `[${head.join(';')}${suffix}]`
}

function patchOperation(operation) {
    if (!operation || typeof operation !== 'object') return '?'
    const head = [operation.op, operation.path].filter(Boolean).join(' ')
    const from = operation.from ? ` from=${operation.from}` : ''
    const value = Object.prototype.hasOwnProperty.call(operation, 'value')
        ? ` value=${formatValue(operation.value)}`
        : ''
    return `${head || '?'}${from}${value}`
}

function pathList(paths) {
    if (!Array.isArray(paths) || !paths.length) return '[-]'
    const maxPaths = 10
    const head = paths.slice(0, maxPaths).map(String)
    const suffix = paths.length > maxPaths ? `,+${paths.length - maxPaths}` : ''
    return `[${head.join(',')}${suffix}]`
}

function shortHash(hash) {
    return typeof hash === 'string' && hash.length > 12 ? hash.slice(0, 8) : (hash || '-')
}

function formatValue(value) {
    if (typeof value === 'string') return JSON.stringify(truncate(value, 80))
    if (value === null || typeof value !== 'object') return String(value)
    if (Array.isArray(value)) return `array(${value.length})`
    return `object(${Object.keys(value).length})`
}

function truncate(value, max) {
    return value.length > max ? `${value.slice(0, max)}...` : value
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
