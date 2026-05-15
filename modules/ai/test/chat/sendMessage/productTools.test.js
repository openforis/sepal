const {of, throwError} = require('rxjs')
const {productTools} = require('#mcp/chat/sendMessage/productTools')
const {aFakeGuiRequests, read, readError} = require('./builders')

describe('product tools', () => {

    function toolNamed(name, guiRequests = aFakeGuiRequests()) {
        return productTools({guiRequests}).find(tool => tool.name === name)
    }

    describe('get_context', () => {

        it('exposes a no-argument schema', () => {
            expect(toolNamed('get_context').parameters).toEqual({
                type: 'object', properties: {}, additionalProperties: false
            })
        })

        it('returns a turn snapshot of the shaped selection when context is present', () => {
            const result = read(toolNamed('get_context').invoke$({}, {
                selection: {section: 'process', selectedRecipe: {recipeId: 'r1', recipeName: 'Mosaic'}}
            }))

            expect(result).toEqual({
                source: 'turn_snapshot',
                available: true,
                selection: {section: 'process', selectedRecipe: {recipeId: 'r1', recipeName: 'Mosaic'}}
            })
        })

        it('reports unavailable when the turn context carries no selection', () => {
            const result = read(toolNamed('get_context').invoke$({}, {}))

            expect(result).toEqual({source: 'turn_snapshot', available: false})
        })

        it('reports unavailable when invoked without a turn context at all', () => {
            const result = read(toolNamed('get_context').invoke$({}))

            expect(result).toEqual({source: 'turn_snapshot', available: false})
        })
    })

    describe('recipe_list', () => {
        const context = {channel: 'CH', conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

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
                channel: 'CH', clientId: 'c1', subscriptionId: 's1',
                action: 'list-recipes', params: {type: 'MOSAIC', projectId: 'p1'}
            }])
        })

        it('omits absent filters from the GUI request params', () => {
            const guiRequests = aFakeGuiRequests(() => of([]))

            read(toolNamed('recipe_list', guiRequests).invoke$({}, context))

            expect(guiRequests.requests[0].params).toEqual({})
        })

        it('projects each recipe to a compact summary, keeping projectId as an internal handle and dropping unknown fields', () => {
            const guiRequests = aFakeGuiRequests(() => of([
                {id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1', creationTime: 1, updateTime: 2, model: {big: 'blob'}}
            ]))

            const result = read(toolNamed('recipe_list', guiRequests).invoke$({}, context))

            expect(result).toEqual([{id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'}])
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

    describe('project_list', () => {
        const context = {channel: 'CH', conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

        it('exposes a no-argument schema', () => {
            expect(toolNamed('project_list').parameters).toEqual({
                type: 'object', properties: {}, additionalProperties: false
            })
        })

        it('asks the GUI to list projects, forwarding the subscription', () => {
            const guiRequests = aFakeGuiRequests(() => of([]))

            read(toolNamed('project_list', guiRequests).invoke$({}, context))

            expect(guiRequests.requests).toEqual([{
                channel: 'CH', clientId: 'c1', subscriptionId: 's1',
                action: 'list-projects', params: {}
            }])
        })

        it('projects each project to id and name, dropping unknown fields', () => {
            const guiRequests = aFakeGuiRequests(() => of([
                {id: 'p1', name: 'Kenya', defaultAssetFolder: 'users/x', defaultWorkspaceFolder: '/home/x'}
            ]))

            const result = read(toolNamed('project_list', guiRequests).invoke$({}, context))

            expect(result).toEqual([{id: 'p1', name: 'Kenya'}])
        })

        it('lets a GUI failure propagate instead of returning an empty list', () => {
            const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('GUI request failed')))

            const error = readError(toolNamed('project_list', guiRequests).invoke$({}, context))

            expect(error.message).toBe('GUI request failed')
        })
    })

    describe('recipe_load', () => {
        const context = {channel: 'CH', conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

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
                channel: 'CH', clientId: 'c1', subscriptionId: 's1',
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

    describe('map_area_list', () => {
        const context = {channel: 'CH', conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

        const populatedSummary = {
            recipeId: 'r1',
            recipeName: 'Kenya mosaic',
            recipeType: 'MOSAIC',
            layout: 'left-right',
            areas: [
                {area: 'left', sourceId: 'this-recipe', sourceType: 'Recipe', sourceLabel: 'self'},
                {area: 'right', sourceId: 'google-satellite', sourceType: 'GoogleSatellite', sourceLabel: 'google-satellite'}
            ],
            aoi: {type: 'EE_TABLE', id: 'FAO/GAUL/2015/level0', key: 73},
            view: {center: {lat: 1.0, lng: 36.0}, zoom: 7, bounds: [[34, -2], [42, 5]]}
        }

        it('exposes a no-argument schema', () => {
            expect(toolNamed('map_area_list').parameters).toEqual({
                type: 'object', properties: {}, additionalProperties: false
            })
        })

        it('asks the GUI to list map areas, forwarding the subscription', () => {
            const guiRequests = aFakeGuiRequests(() => of({available: false, reason: 'no_active_recipe'}))

            read(toolNamed('map_area_list', guiRequests).invoke$({}, context))

            expect(guiRequests.requests).toEqual([{
                channel: 'CH', clientId: 'c1', subscriptionId: 's1',
                action: 'list-map-areas', params: {}
            }])
        })

        it('returns the GUI summary for the active recipe', () => {
            const guiRequests = aFakeGuiRequests(() => of(populatedSummary))

            const result = read(toolNamed('map_area_list', guiRequests).invoke$({}, context))

            expect(result).toEqual(populatedSummary)
        })

        it('returns an unavailable marker when no recipe is active', () => {
            const guiRequests = aFakeGuiRequests(() => of({available: false, reason: 'no_active_recipe'}))

            const result = read(toolNamed('map_area_list', guiRequests).invoke$({}, context))

            expect(result).toEqual({available: false, reason: 'no_active_recipe'})
        })

        it('lets a GUI failure propagate', () => {
            const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('GUI request failed')))

            const error = readError(toolNamed('map_area_list', guiRequests).invoke$({}, context))

            expect(error.message).toBe('GUI request failed')
        })
    })

    describe('layer_list', () => {
        const context = {channel: 'CH', conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

        const populatedSummary = {
            recipeId: 'r1',
            areas: [{
                area: 'center',
                imageLayer: {
                    sourceId: 'this-recipe', sourceType: 'Recipe', sourceLabel: 'self',
                    visualization: {type: 'rgb', bands: ['red', 'green', 'blue']}
                },
                featureLayers: [
                    {sourceId: 'aoi', enabled: true},
                    {sourceId: 'labels', enabled: false}
                ]
            }]
        }

        it('exposes a no-argument schema', () => {
            expect(toolNamed('layer_list').parameters).toEqual({
                type: 'object', properties: {}, additionalProperties: false
            })
        })

        it('asks the GUI to list layers, forwarding the subscription', () => {
            const guiRequests = aFakeGuiRequests(() => of({available: false, reason: 'no_active_recipe'}))

            read(toolNamed('layer_list', guiRequests).invoke$({}, context))

            expect(guiRequests.requests).toEqual([{
                channel: 'CH', clientId: 'c1', subscriptionId: 's1',
                action: 'list-layers', params: {}
            }])
        })

        it('returns the GUI summary for the active recipe', () => {
            const guiRequests = aFakeGuiRequests(() => of(populatedSummary))

            const result = read(toolNamed('layer_list', guiRequests).invoke$({}, context))

            expect(result).toEqual(populatedSummary)
        })

        it('returns an unavailable marker when no recipe is active', () => {
            const guiRequests = aFakeGuiRequests(() => of({available: false, reason: 'no_active_recipe'}))

            const result = read(toolNamed('layer_list', guiRequests).invoke$({}, context))

            expect(result).toEqual({available: false, reason: 'no_active_recipe'})
        })

        it('lets a GUI failure propagate', () => {
            const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('GUI request failed')))

            const error = readError(toolNamed('layer_list', guiRequests).invoke$({}, context))

            expect(error.message).toBe('GUI request failed')
        })
    })
})
