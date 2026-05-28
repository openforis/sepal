// Bus event publishers for the create_recipe flow. Currently a single
// terminal outcome event; request/diagnostic events are intentionally absent
// until create migrates to the request+context contract.

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
        message: outcomeMessage({recipeType, recipeId, attempted, succeeded, code, lastToolErrorCode, answerChars})
    })
}

function outcomeMessage({recipeType, recipeId, attempted, succeeded, code, lastToolErrorCode, answerChars}) {
    const head = `create_recipe.outcome recipeType=${recipeType} recipeId=${recipeId || '-'} createAttempted=${attempted} createSucceeded=${succeeded} code=${code}`
    const tail = ` answerChars=${answerChars}`
    return lastToolErrorCode
        ? `${head} lastToolErrorCode=${lastToolErrorCode}${tail}`
        : `${head}${tail}`
}

module.exports = {publishCreateRecipeOutcome}
