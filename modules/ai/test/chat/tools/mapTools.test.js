const {of, throwError} = require('rxjs')
const {mapTools} = require('#mcp/chat/tools/mapTools')
const {aFakeGuiRequests, read, readError} = require('../builders')

describe('map tools', () => {
    const context = {channel: 'CH', conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

    function toolNamed(name, guiRequests = aFakeGuiRequests()) {
        return mapTools(guiRequests).find(tool => tool.name === name)
    }

    describe('map_area_list', () => {
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
