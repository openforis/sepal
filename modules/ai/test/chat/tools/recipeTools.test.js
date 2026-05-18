const {of, throwError} = require('rxjs')
const {recipeTools} = require('#mcp/chat/tools/recipeTools')
const {aFakeGuiRequests, read, readError} = require('../builders')

describe('recipe tools', () => {
    const context = {conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

    function toolNamed(name, guiRequests = aFakeGuiRequests()) {
        return recipeTools(guiRequests).find(tool => tool.name === name)
    }

    describe('recipe_list', () => {

        it('exposes an optional type/projectId filter schema', () => {
            expect(toolNamed('recipe_list').parameters).toEqual({
                type: 'object',
                properties: {type: {type: 'string'}, projectId: {type: 'string'}},
                additionalProperties: false
            })
        })

        it('asks the GUI to list recipes, forwarding the filter params and subscription', () => {
            const guiRequests = aFakeGuiRequests(() => of([]))

            read(toolNamed('recipe_list', guiRequests).invoke$({type: 'MOSAIC', projectId: 'p1'}, context))

            expect(guiRequests.requests).toEqual([{
                clientId: 'c1', subscriptionId: 's1',
                action: 'list-recipes', params: {type: 'MOSAIC', projectId: 'p1'}
            }])
        })

        it('omits absent filters from the GUI request params', () => {
            const guiRequests = aFakeGuiRequests(() => of([]))

            read(toolNamed('recipe_list', guiRequests).invoke$({}, context))

            expect(guiRequests.requests[0].params).toEqual({})
        })

        it('projects each recipe to a compact summary, keeping handles and timestamps but dropping unknown fields', () => {
            const guiRequests = aFakeGuiRequests(() => of([
                {id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1', creationTime: 1, updateTime: 2, model: {big: 'blob'}}
            ]))

            const result = read(toolNamed('recipe_list', guiRequests).invoke$({}, context))

            expect(result).toEqual([{
                id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1',
                creationTime: 1, updateTime: 2
            }])
        })

        it('omits projectId when a recipe has none', () => {
            const guiRequests = aFakeGuiRequests(() => of([{id: 'r1', type: 'MOSAIC', name: 'Kenya'}]))

            const result = read(toolNamed('recipe_list', guiRequests).invoke$({}, context))

            expect(result).toEqual([{id: 'r1', type: 'MOSAIC', name: 'Kenya'}])
        })

        it('omits projectId when a recipe has a JS no-value projectId', () => {
            const guiRequests = aFakeGuiRequests(() => of([
                {id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: ''},
                {id: 'r2', type: 'MOSAIC', name: 'Sudan', projectId: null}
            ]))

            const result = read(toolNamed('recipe_list', guiRequests).invoke$({}, context))

            expect(result).toEqual([
                {id: 'r1', type: 'MOSAIC', name: 'Kenya'},
                {id: 'r2', type: 'MOSAIC', name: 'Sudan'}
            ])
        })

        it('falls back to the recipe title when it has no name', () => {
            const guiRequests = aFakeGuiRequests(() => of([{id: 'r1', type: 'MOSAIC', title: 'Kenya mosaic'}]))

            const result = read(toolNamed('recipe_list', guiRequests).invoke$({}, context))

            expect(result).toEqual([{id: 'r1', type: 'MOSAIC', name: 'Kenya mosaic'}])
        })

        it('falls back to the recipe title when the name is blank', () => {
            const guiRequests = aFakeGuiRequests(() => of([
                {id: 'r1', type: 'MOSAIC', name: '', title: 'Kenya mosaic'}
            ]))

            const result = read(toolNamed('recipe_list', guiRequests).invoke$({}, context))

            expect(result).toEqual([{id: 'r1', type: 'MOSAIC', name: 'Kenya mosaic'}])
        })

        it('falls back to the recipe placeholder when it has neither name nor title', () => {
            const guiRequests = aFakeGuiRequests(() => of([{id: 'r1', type: 'MOSAIC', placeholder: 'Untitled mosaic'}]))

            const result = read(toolNamed('recipe_list', guiRequests).invoke$({}, context))

            expect(result).toEqual([{id: 'r1', type: 'MOSAIC', name: 'Untitled mosaic'}])
        })

        it('lets a GUI failure propagate instead of returning an empty list', () => {
            const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('GUI request timed out')))

            const error = readError(toolNamed('recipe_list', guiRequests).invoke$({}, context))

            expect(error.message).toBe('GUI request timed out')
        })
    })

    describe('recipe_open', () => {

        it('exposes a required recipeId schema', () => {
            expect(toolNamed('recipe_open').parameters).toEqual({
                type: 'object',
                properties: {recipeId: {type: 'string'}},
                required: ['recipeId'],
                additionalProperties: false
            })
        })

        it('asks the GUI to open the recipe by id', () => {
            const guiRequests = aFakeGuiRequests(() => of({id: 'r1', name: 'Kenya'}))

            const result = read(toolNamed('recipe_open', guiRequests).invoke$({recipeId: 'r1'}, context))

            expect(guiRequests.requests).toEqual([{
                clientId: 'c1', subscriptionId: 's1',
                action: 'open', params: {recipeId: 'r1'}
            }])
            expect(result).toEqual({id: 'r1', name: 'Kenya'})
        })
    })

    describe('recipe_load', () => {
        const loadedRecipe = {
            id: 'r1',
            type: 'CLASSIFICATION',
            title: 'Kenya land cover',
            projectId: 'p1',
            modelHash: 'hash-abc',
            model: {
                trainingData: {dataSets: [
                    {dataSetId: 'd1', type: 'COLLECTED', referenceData: [{x: 1, y: 2, class: 'forest'}]}
                ]},
                classifier: {type: 'RANDOM_FOREST', numberOfTrees: 25}
            }
        }

        it('exposes a recipeId + optional path schema', () => {
            expect(toolNamed('recipe_load').parameters).toEqual({
                type: 'object',
                properties: {recipeId: {type: 'string'}, path: {type: 'string'}},
                required: ['recipeId'],
                additionalProperties: false
            })
        })

        it('asks the GUI to load the recipe by id, without forwarding the model path', () => {
            const guiRequests = aFakeGuiRequests(() => of(loadedRecipe))

            read(toolNamed('recipe_load', guiRequests).invoke$({recipeId: 'r1', path: '/classifier'}, context))

            expect(guiRequests.requests).toEqual([{
                clientId: 'c1', subscriptionId: 's1',
                action: 'load-recipe', params: {recipeId: 'r1'}
            }])
        })

        it('returns the projected recipe for a root load, with heavy training data omitted', () => {
            const guiRequests = aFakeGuiRequests(() => of(loadedRecipe))

            const result = read(toolNamed('recipe_load', guiRequests).invoke$({recipeId: 'r1'}, context))

            expect(result).toEqual({
                id: 'r1', type: 'CLASSIFICATION', name: 'Kenya land cover', projectId: 'p1', modelHash: 'hash-abc',
                model: {
                    trainingData: {dataSets: [{
                        dataSetId: 'd1', type: 'COLLECTED',
                        referenceData: {_omitted: 1, _kind: 'referenceData', _path: '/trainingData/dataSets/0/referenceData'}
                    }]},
                    classifier: {type: 'RANDOM_FOREST', numberOfTrees: 25}
                }
            })
        })

        it('returns the requested model fragment under value for a path-scoped load', () => {
            const guiRequests = aFakeGuiRequests(() => of(loadedRecipe))

            const result = read(toolNamed('recipe_load', guiRequests).invoke$({recipeId: 'r1', path: '/classifier'}, context))

            expect(result).toMatchObject({id: 'r1', value: {type: 'RANDOM_FOREST', numberOfTrees: 25}})
        })

        it('errors on an invalid model path so the registry reports a tool failure', () => {
            const guiRequests = aFakeGuiRequests(() => of(loadedRecipe))

            const error = readError(toolNamed('recipe_load', guiRequests).invoke$({recipeId: 'r1', path: '/missing'}, context))

            expect(error.message).toMatch(/not found/)
        })

        it('lets a GUI failure propagate', () => {
            const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('GUI request timed out')))

            const error = readError(toolNamed('recipe_load', guiRequests).invoke$({recipeId: 'r1'}, context))

            expect(error.message).toBe('GUI request timed out')
        })

        it('fails when the GUI response carries no modelHash, rather than returning an unusable token', () => {
            const {modelHash: _modelHash, ...withoutHash} = loadedRecipe
            const guiRequests = aFakeGuiRequests(() => of(withoutHash))

            const error = readError(toolNamed('recipe_load', guiRequests).invoke$({recipeId: 'r1'}, context))

            expect(error.message).toMatch(/modelHash/)
        })
    })
})
