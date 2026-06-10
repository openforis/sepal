// Bus event publishers for the update_recipe flow — request envelope,
// per-call value submissions, projections, change diffs, and the terminal
// outcome. Counts and hashes ride debug/info; raw user text rides trace.

import {shortHashOf} from '../../diagnostics.js'
import {nameList, truncate} from '../eventFormatting.js'
import {compactJson, handleValuesSummary, recipeStateSummary} from '../recipeStateDiagnostics.js'

function publishUpdateRecipeRequest({bus, conversationId, recipeId, request, contextText, guiContext}) {
    const recipeContext = recipeContextSummary(recipeId, guiContext)
    const requestText = request || ''
    const requestChars = requestText.length
    const requestHash = shortHashOf(requestText)
    const hasContext = !!contextText
    const contextChars = hasContext ? contextText.length : 0
    const contextHash = hasContext ? shortHashOf(contextText) : null
    bus.publish({
        type: 'update_recipe.request',
        level: 'info',
        conversationId,
        recipeId,
        requestChars,
        requestHash,
        ...(hasContext ? {contextChars, contextHash} : {}),
        ...recipeContext,
        message: `update_recipe.request recipeId=${recipeId} selected=${recipeContext.selectedRecipeId || '-'}`
            + ` open=${recipeContext.openRecipeIds.length}${nameList(recipeContext.openRecipeIds)} match=${recipeContext.recipeContextMatch}`
            + ` requestChars=${requestChars} requestHash=${requestHash}`
            + (hasContext ? ` contextChars=${contextChars} contextHash=${contextHash}` : '')
    })
    bus.publish({
        type: 'update_recipe.request.body',
        level: 'trace',
        conversationId,
        recipeId,
        request: truncate(requestText, 600),
        ...(hasContext ? {contextText: truncate(contextText, 400)} : {}),
        message: () => `update_recipe.request.body recipeId=${recipeId}`
            + ` request=${JSON.stringify(truncate(requestText, 600))}`
            + (hasContext ? ` context=${JSON.stringify(truncate(contextText, 400))}` : '')
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

// Partial success — a patch landed but a later call failed — is encoded
// explicitly: `partialFailure` for structured consumers, distinct
// `ok-partial` code so alerts/queries can match without joining fields.
function publishUpdateRecipeOutcome({bus, conversationId, recipeId, attempted, succeeded, code, lastPatchErrorCode, answerChars}) {
    const partialFailure = succeeded === true && !!lastPatchErrorCode
    const effectiveCode = partialFailure ? 'ok-partial' : code
    bus.publish({
        type: 'update_recipe.outcome',
        level: 'info',
        conversationId,
        recipeId,
        patchAttempted: attempted,
        patchSucceeded: succeeded,
        partialFailure,
        code: effectiveCode,
        lastPatchErrorCode: lastPatchErrorCode || null,
        answerChars,
        message: outcomeMessage({recipeId, attempted, succeeded, partialFailure, code: effectiveCode, lastPatchErrorCode, answerChars})
    })
}

function outcomeMessage({recipeId, attempted, succeeded, partialFailure, code, lastPatchErrorCode, answerChars}) {
    const head = `update_recipe.outcome recipeId=${recipeId} patchAttempted=${attempted} patchSucceeded=${succeeded} partialFailure=${partialFailure} code=${code}`
    const tail = ` answerChars=${answerChars}`
    return lastPatchErrorCode
        ? `${head} lastPatchErrorCode=${lastPatchErrorCode}${tail}`
        : `${head}${tail}`
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

export {
    publishUpdateRecipeOutcome,
    publishUpdateRecipeRequest,
    publishUpdateRecipeValuesChanged,
    publishUpdateRecipeValuesProjection,
    publishUpdateRecipeValuesRequest}
