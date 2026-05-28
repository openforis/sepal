const {
    publishUpdateRecipeRequest,
    publishUpdateRecipeValuesRequest,
    publishUpdateRecipeValuesProjection,
    publishUpdateRecipeValuesChanged,
    publishUpdateRecipeOutcome
} = require('#mcp/chat/specialists/updateRecipe/updateRecipeEvents')
const {aRecordingBus} = require('../../harness')

describe('publishUpdateRecipeRequest', () => {

    it('publishes counts + hashes + routing context at info level, never raw text', () => {
        const bus = aRecordingBus()

        publishUpdateRecipeRequest({
            bus, conversationId: 'c1', recipeId: 'r1',
            request: 'make it faster',
            contextText: 'follow-up to slow rendering',
            guiContext: {selectedRecipe: {id: 'r1'}, openRecipes: [{id: 'r1'}, {id: 'r2'}]}
        })

        const info = bus.events.find(event => event.type === 'update_recipe.request')
        expect(info).toMatchObject({
            level: 'info',
            recipeId: 'r1',
            requestChars: 'make it faster'.length,
            contextChars: 'follow-up to slow rendering'.length,
            selectedRecipeId: 'r1',
            openRecipeIds: ['r1', 'r2'],
            recipeContextMatch: 'selected'
        })
        expect(info.requestHash).toMatch(/^[0-9a-f]{8}$/)
        expect(info.contextHash).toMatch(/^[0-9a-f]{8}$/)
        expect(info).not.toHaveProperty('request')
        expect(info).not.toHaveProperty('contextText')
    })

    it('publishes the raw request + contextText body at trace level', () => {
        const bus = aRecordingBus()

        publishUpdateRecipeRequest({
            bus, conversationId: 'c1', recipeId: 'r1',
            request: 'make it faster',
            contextText: 'follow-up to slow rendering',
            guiContext: {selectedRecipe: {id: 'r1'}, openRecipes: []}
        })

        expect(bus.events.find(event => event.type === 'update_recipe.request.body')).toMatchObject({
            level: 'trace',
            request: 'make it faster',
            contextText: 'follow-up to slow rendering'
        })
    })

    it('omits all context fields (info + trace) when no context was supplied', () => {
        const bus = aRecordingBus()

        publishUpdateRecipeRequest({
            bus, conversationId: 'c1', recipeId: 'r1',
            request: 'make it faster', contextText: '',
            guiContext: {selectedRecipe: {id: 'r1'}, openRecipes: []}
        })

        const info = bus.events.find(event => event.type === 'update_recipe.request')
        const body = bus.events.find(event => event.type === 'update_recipe.request.body')
        expect(info).not.toHaveProperty('contextChars')
        expect(info).not.toHaveProperty('contextHash')
        expect(body).not.toHaveProperty('contextText')
    })
})

describe('publishUpdateRecipeValuesRequest', () => {

    it('publishes a bounded structured value summary at debug level', () => {
        const bus = aRecordingBus()

        publishUpdateRecipeValuesRequest({
            bus, conversationId: 'c1', recipeId: 'r1',
            values: {datasets: {LANDSAT: ['LANDSAT_9']}, cloudMethods: ['sepalCloudScore']}
        })

        expect(bus.events[0]).toMatchObject({
            type: 'update_recipe.values.request',
            level: 'debug',
            recipeId: 'r1',
            handleCount: 2,
            handles: ['datasets', 'cloudMethods'],
            values: {datasets: {LANDSAT: ['LANDSAT_9']}, cloudMethods: ['sepalCloudScore']}
        })
    })
})

describe('publishUpdateRecipeValuesProjection', () => {

    it('publishes current/desired/projected model summaries at trace level', () => {
        const bus = aRecordingBus()
        const currentModel = {sources: {dataSets: {LANDSAT: ['LANDSAT_9']}, cloudPercentageThreshold: 90}, compositeOptions: {corrections: ['SR', 'BRDF'], includedCloudMasking: []}}
        const desiredModel = {sources: {dataSets: {LANDSAT: ['LANDSAT_9']}, cloudPercentageThreshold: 50}, compositeOptions: {corrections: ['SR'], includedCloudMasking: []}}

        publishUpdateRecipeValuesProjection({
            bus, conversationId: 'c1', recipeId: 'r1',
            currentModel, desiredModel, projectedModel: desiredModel
        })

        expect(bus.events[0]).toMatchObject({
            type: 'update_recipe.values.projection',
            level: 'trace',
            current: {sceneCloudLimit: 90, corrections: ['SR', 'BRDF']},
            desired: {sceneCloudLimit: 50, corrections: ['SR']},
            projected: {sceneCloudLimit: 50, corrections: ['SR']}
        })
    })
})

describe('publishUpdateRecipeValuesChanged', () => {

    it('publishes the diff in handles + operations after value application', () => {
        const bus = aRecordingBus()

        publishUpdateRecipeValuesChanged({
            bus, conversationId: 'c1', recipeId: 'r1',
            changedHandles: ['sceneCloudLimit', 'corrections'], operationCount: 2
        })

        expect(bus.events[0]).toMatchObject({
            type: 'update_recipe.values.changed',
            level: 'debug',
            changedHandleCount: 2,
            changedHandles: ['sceneCloudLimit', 'corrections'],
            operationCount: 2
        })
    })
})

describe('publishUpdateRecipeOutcome', () => {

    it('publishes a clean success as code=ok with partialFailure=false', () => {
        const bus = aRecordingBus()

        publishUpdateRecipeOutcome({
            bus, recipeId: 'r1', attempted: true, succeeded: true,
            code: 'ok', lastPatchErrorCode: null, answerChars: 42
        })

        expect(bus.events[0]).toMatchObject({
            type: 'update_recipe.outcome',
            level: 'info',
            patchAttempted: true,
            patchSucceeded: true,
            code: 'ok',
            partialFailure: false,
            lastPatchErrorCode: null,
            answerChars: 42
        })
    })

    it('rewrites a successful outcome with a trailing error as code=ok-partial + partialFailure=true', () => {
        const bus = aRecordingBus()

        publishUpdateRecipeOutcome({
            bus, recipeId: 'r1', attempted: true, succeeded: true,
            code: 'ok', lastPatchErrorCode: 'VALIDATION_FAILED', answerChars: 30
        })

        expect(bus.events[0]).toMatchObject({
            patchSucceeded: true,
            partialFailure: true,
            code: 'ok-partial',
            lastPatchErrorCode: 'VALIDATION_FAILED'
        })
    })

    it('does not mark a non-success outcome as partial, even when a lastPatchErrorCode is present', () => {
        const bus = aRecordingBus()

        publishUpdateRecipeOutcome({
            bus, recipeId: 'r1', attempted: true, succeeded: false,
            code: 'UPDATE_FAILED', lastPatchErrorCode: 'VALIDATION_FAILED', answerChars: 0
        })

        expect(bus.events[0]).toMatchObject({partialFailure: false, code: 'UPDATE_FAILED'})
    })
})
