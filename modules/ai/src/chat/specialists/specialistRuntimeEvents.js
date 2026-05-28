// Bus event publishers for the specialist inner loop — per-round lifecycle
// (request / response / stall) and per-tool call (request / response). All
// debug-level; raw bodies live on the trace-level specialist.prompt event
// emitted via loopEvents.publishLoopPrompt.

const {publishLoopPrompt} = require('../loopEvents')
const {textChunk} = require('../diagnostics')
const {compactJson, recipeStateSummary} = require('./recipeStateDiagnostics')
const {abbreviateHash, nameList, truncate} = require('./eventFormatting')

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

function publishSpecialistResponse({bus, name, round, conversationId, text, toolCalls, reasoningChars = 0, finishReason = null}) {
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
        reasoningChars,
        finishReason,
        message: `specialist.response name=${name} round=${round} textChars=${textChars} toolCalls=[${toolCallNames.join(',') || '-'}]`
            + ` reasoningChars=${reasoningChars} finishReason=${finishReason ?? '-'}${empty ? ' empty=true' : ''}`
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
        const errorMessage = envelope.error?.message || ''
        const handleErrors = handleErrorsFor(envelope.error)
        bus.publish({
            type: 'specialist.tool.response',
            level: 'debug',
            conversationId,
            name,
            tool,
            ok: false,
            errorCode,
            errorMessage,
            ...(handleErrors ? {handleErrors} : {}),
            message: `specialist.tool.response name=${name} tool=${tool} ok=false errorCode=${errorCode}`
                + (errorMessage ? ` error=${JSON.stringify(truncate(errorMessage, 200))}` : '')
                + (handleErrors ? ` handleErrors=${formatHandleErrors(handleErrors)}` : '')
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

function handleErrorsFor(error) {
    if (!Array.isArray(error?.handleErrors) || !error.handleErrors.length) return null
    return error.handleErrors.map(entry => ({
        handle: entry.handle || null,
        message: entry.message || ''
    }))
}

function formatHandleErrors(handleErrors) {
    return `[${handleErrors.map(entry => `${entry.handle || '?'}: ${truncate(entry.message, 80)}`).join('; ')}]`
}

function summariseToolInput(tool, input) {
    if (!input || typeof input !== 'object') return ''
    if (tool === 'update_recipe_values') {
        return [
            `recipeId=${input.recipeId || '-'}`,
            `baseModelHash=${abbreviateHash(input.baseModelHash)}`,
            `handles=${nameList(Object.keys(input.values || {}))}`
        ].join(' ')
    }
    if (tool === 'aoi_list_countries') {
        return input.query ? textChunk('query', input.query).join(' ') : ''
    }
    if (tool === 'aoi_list_country_areas') {
        const parts = [`countryId=${input.countryId || '-'}`]
        if (input.query) parts.push(...textChunk('query', input.query))
        return parts.join(' ')
    }
    return ''
}

function summariseToolShape(tool, data) {
    if (tool === 'update_recipe_values') {
        const applied = data?.appliedHandles || []
        const invalidated = data?.invalidatedHandles || []
        return `update(modelHash=${abbreviateHash(data?.modelHash)},applied=${applied.length}${nameList(applied)},invalidated=${invalidated.length}${nameList(invalidated)})`
    }
    if (tool === 'recipe_load' && data && typeof data === 'object') {
        return data.sources || data.compositeOptions || data.dates
            ? `recipeLoad(${compactJson(recipeStateSummary(data))})`
            : 'recipeLoad(fragment)'
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
    publishSpecialistToolResponse
}
