const {publishCreateRecipeOutcome} = require('#mcp/chat/specialists/createRecipe/createRecipeEvents')
const {aRecordingBus} = require('../../harness')

describe('publishCreateRecipeOutcome', () => {

    it('publishes success at info level with recipeId + summary fields', () => {
        const bus = aRecordingBus()

        publishCreateRecipeOutcome({
            bus, conversationId: 'c1', recipeType: 'MOSAIC',
            recipeId: 'r-new', attempted: true, succeeded: true,
            code: 'ok', lastToolErrorCode: null, answerChars: 30
        })

        expect(bus.events[0]).toMatchObject({
            type: 'create_recipe.outcome',
            level: 'info',
            recipeType: 'MOSAIC',
            recipeId: 'r-new',
            createAttempted: true,
            createSucceeded: true,
            code: 'ok',
            lastToolErrorCode: null
        })
    })

    it('publishes a failure with the last tool error code', () => {
        const bus = aRecordingBus()

        publishCreateRecipeOutcome({
            bus, conversationId: 'c1', recipeType: 'MOSAIC',
            attempted: true, succeeded: false,
            code: 'CREATE_FAILED', lastToolErrorCode: 'VALIDATION_FAILED', answerChars: 50
        })

        expect(bus.events[0]).toMatchObject({
            createAttempted: true,
            createSucceeded: false,
            code: 'CREATE_FAILED',
            lastToolErrorCode: 'VALIDATION_FAILED'
        })
    })
})
