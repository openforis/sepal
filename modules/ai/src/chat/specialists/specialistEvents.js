// Bus event publishers for the specialist runtime. Compact summaries at
// DEBUG (per-round lifecycle) and INFO (update outcome). The per-tool
// summarisers are narrow: high-volume value/lookup tools get compact bespoke
// strings, and new tools still publish usable generic events.

const {publishLoopPrompt} = require('../loopEvents')
const {compactJson, handleValuesSummary, recipeStateSummary} = require('./recipeStateDiagnostics')

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

// reasoningChars + finishReason are counts-only provider summary fields (never
// reasoning text): empty=true reasoningChars=1840 finishReason=length signals
// reasoning-burn at the token cap, reasoningChars=0 a true empty round.
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

function publishPickHandlesCompleted({bus, conversationId, recipeType, pickedHandles, flow = 'update'}) {
    const type = `${flow}_recipe.picker.completed`
    bus.publish({
        type,
        level: 'info',
        conversationId,
        recipeType,
        pickedHandleCount: pickedHandles.length,
        pickedHandles,
        message: `${type} recipeType=${recipeType} picked=${pickedHandles.length}${nameList(pickedHandles)}`
    })
}

function publishPrepareHandlePacketCompleted({bus, conversationId, recipeType, pickedHandles, writableHandles, readOnlyHandles = [], requiredHandles = [], flow = 'update'}) {
    const type = `${flow}_recipe.prepare.completed`
    bus.publish({
        type,
        level: 'info',
        conversationId,
        recipeType,
        pickedHandleCount: pickedHandles.length,
        requiredHandleCount: requiredHandles.length,
        writableHandleCount: writableHandles.length,
        readOnlyHandleCount: readOnlyHandles.length,
        writableHandles,
        readOnlyHandles,
        message: `${type} recipeType=${recipeType} picked=${pickedHandles.length}${nameList(pickedHandles)}`
            + ` required=${requiredHandles.length} writable=${writableHandles.length}${nameList(writableHandles)}`
            + ` readOnly=${readOnlyHandles.length}${nameList(readOnlyHandles)}`
    })
}

function publishUpdateRecipeRequest({bus, conversationId, recipeId, request, contextText, guiContext}) {
    const recipeContext = recipeContextSummary(recipeId, guiContext)
    bus.publish({
        type: 'update_recipe.request',
        level: 'info',
        conversationId,
        recipeId,
        request: truncate(request || '', 600),
        ...(contextText ? {contextText: truncate(contextText, 400)} : {}),
        ...recipeContext,
        message: `update_recipe.request recipeId=${recipeId} selected=${recipeContext.selectedRecipeId || '-'}`
            + ` open=${recipeContext.openRecipeIds.length}${nameList(recipeContext.openRecipeIds)} match=${recipeContext.recipeContextMatch}`
            + ` request=${JSON.stringify(truncate(request || '', 600))}`
            + (contextText ? ` context=${JSON.stringify(truncate(contextText, 400))}` : '')
    })
}

function publishUpdateRecipeValuesRequest({bus, conversationId, recipeId, values}) {
    const handles = Object.keys(values || {})
    const valueSummary = handleValuesSummary(values || {})
    bus.publish({
        type: 'update_recipe.values.request',
        level: 'debug',
        conversationId,
        recipeId,
        handleCount: handles.length,
        handles,
        values: valueSummary,
        message: () => `update_recipe.values.request recipeId=${recipeId} handles=${handles.length}${nameList(handles)} values=${compactJson(valueSummary)}`
    })
}

function publishUpdateRecipeValuesProjection({bus, conversationId, recipeId, currentModel, desiredModel, projectedModel}) {
    const current = recipeStateSummary(currentModel)
    const desired = recipeStateSummary(desiredModel)
    const projected = recipeStateSummary(projectedModel)
    bus.publish({
        type: 'update_recipe.values.projection',
        level: 'trace',
        conversationId,
        recipeId,
        current,
        desired,
        projected,
        message: () => `update_recipe.values.projection recipeId=${recipeId}`
            + ` current=${compactJson(current)} desired=${compactJson(desired)} projected=${compactJson(projected)}`
    })
}

function publishUpdateRecipeValuesChanged({bus, conversationId, recipeId, changedHandles, operationCount}) {
    bus.publish({
        type: 'update_recipe.values.changed',
        level: 'debug',
        conversationId,
        recipeId,
        changedHandleCount: changedHandles.length,
        changedHandles,
        operationCount,
        message: `update_recipe.values.changed recipeId=${recipeId} operations=${operationCount} changed=${changedHandles.length}${nameList(changedHandles)}`
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

function publishCreateRecipeOutcome({bus, conversationId, recipeType, recipeId, attempted, succeeded, code, lastToolErrorCode, answerChars}) {
    bus.publish({
        type: 'create_recipe.outcome',
        level: 'info',
        conversationId,
        recipeType,
        recipeId: recipeId || null,
        createAttempted: attempted,
        createSucceeded: succeeded,
        code,
        lastToolErrorCode: lastToolErrorCode || null,
        answerChars,
        message: createOutcomeMessage({recipeType, recipeId, attempted, succeeded, code, lastToolErrorCode, answerChars})
    })
}

function createOutcomeMessage({recipeType, recipeId, attempted, succeeded, code, lastToolErrorCode, answerChars}) {
    const head = `create_recipe.outcome recipeType=${recipeType} recipeId=${recipeId || '-'} createAttempted=${attempted} createSucceeded=${succeeded} code=${code}`
    const tail = ` answerChars=${answerChars}`
    return lastToolErrorCode
        ? `${head} lastToolErrorCode=${lastToolErrorCode}${tail}`
        : `${head}${tail}`
}

// Handle-keyed validation reasons from the GUI patch bridge, the only
// per-tool error shape the specialist runtime needs to flatten. The human
// messages stay off this diagnostic line — they reach the user via the
// update_recipe answer.
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
            `baseModelHash=${shortHash(input.baseModelHash)}`,
            `handles=${nameList(Object.keys(input.values || {}))}`
        ].join(' ')
    }
    if (tool === 'aoi_list_countries') {
        return input.query ? `query=${JSON.stringify(truncate(input.query, 80))}` : ''
    }
    if (tool === 'aoi_list_country_areas') {
        const parts = [`countryId=${input.countryId || '-'}`]
        if (input.query) parts.push(`query=${JSON.stringify(truncate(input.query, 80))}`)
        return parts.join(' ')
    }
    return ''
}

function summariseToolShape(tool, data) {
    if (tool === 'update_recipe_values') {
        const applied = data?.appliedHandles || []
        const invalidated = data?.invalidatedHandles || []
        return `update(modelHash=${shortHash(data?.modelHash)},applied=${applied.length}${nameList(applied)},invalidated=${invalidated.length}${nameList(invalidated)})`
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

function nameList(names) {
    if (!Array.isArray(names) || !names.length) return '[-]'
    const maxNames = 10
    const head = names.slice(0, maxNames).map(String)
    const suffix = names.length > maxNames ? `,+${names.length - maxNames}` : ''
    return `[${head.join(',')}${suffix}]`
}

function shortHash(hash) {
    return typeof hash === 'string' && hash.length > 12 ? hash.slice(0, 8) : (hash || '-')
}

function truncate(value, max) {
    return value.length > max ? `${value.slice(0, max)}...` : value
}

function recipeContextSummary(recipeId, guiContext) {
    const selectedRecipeId = recipeIdOf(guiContext?.selectedRecipe)
    const openRecipeIds = Array.isArray(guiContext?.openRecipes)
        ? guiContext.openRecipes.map(recipeIdOf).filter(Boolean)
        : []
    return {
        selectedRecipeId: selectedRecipeId || null,
        openRecipeIds,
        recipeContextMatch: recipeIdMatch(recipeId, {selectedRecipeId, openRecipeIds})
    }
}

function recipeIdOf(recipe) {
    return recipe?.recipeId || recipe?.id || null
}

function recipeIdMatch(recipeId, {selectedRecipeId, openRecipeIds}) {
    if (recipeId && recipeId === selectedRecipeId) return 'selected'
    if (recipeId && openRecipeIds.includes(recipeId)) return openRecipeIds.length === 1 ? 'only-open' : 'open'
    if (!recipeId) return 'missing'
    return selectedRecipeId || openRecipeIds.length ? 'not-current' : 'no-context'
}

module.exports = {
    publishSpecialistPrompt,
    publishSpecialistRequest,
    publishSpecialistResponse,
    publishSpecialistStall,
    publishSpecialistToolRequest,
    publishSpecialistToolResponse,
    publishPickHandlesCompleted,
    publishPrepareHandlePacketCompleted,
    publishUpdateRecipeRequest,
    publishUpdateRecipeValuesRequest,
    publishUpdateRecipeValuesProjection,
    publishUpdateRecipeValuesChanged,
    publishUpdateRecipeOutcome,
    publishCreateRecipeOutcome
}
