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

        it('projects each recipe to a compact summary, dropping unknown fields', () => {
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
})
