const {of, throwError} = require('rxjs')
const {aoiTools} = require('#mcp/chat/tools/aoiTools')
const {sepalTools, specialistInnerTools} = require('#mcp/chat/tools/sepalTools')
const {aFakeGuiRequests, read, readError} = require('../builders')

describe('aoi tools', () => {
    const context = {conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

    function toolNamed(name, guiRequests = aFakeGuiRequests()) {
        return aoiTools(guiRequests).find(tool => tool.name === name)
    }

    describe('aoi_list_countries', () => {

        it('asks the GUI for the country list, forwarding the subscription', () => {
            const guiRequests = aFakeGuiRequests(() => of([]))

            read(toolNamed('aoi_list_countries', guiRequests).invoke$({}, context))

            expect(guiRequests.requests).toEqual([{
                clientId: 'c1', subscriptionId: 's1',
                action: 'list-countries', params: {}
            }])
        })

        it('returns rows verbatim when no query is supplied', () => {
            const rows = [
                {label: 'Albania', aoi: {type: 'EE_TABLE', id: 'gaul', keyColumn: 'id', key: 3, level: 'COUNTRY'}},
                {label: 'Ecuador', aoi: {type: 'EE_TABLE', id: 'gaul', keyColumn: 'id', key: 73, level: 'COUNTRY'}}
            ]
            const guiRequests = aFakeGuiRequests(() => of(rows))

            const result = read(toolNamed('aoi_list_countries', guiRequests).invoke$({}, context))

            expect(result).toEqual(rows)
        })

        it('filters rows by case-insensitive substring on label when query is supplied', () => {
            const rows = [
                {label: 'Albania', aoi: {key: 3}},
                {label: 'Algeria', aoi: {key: 4}},
                {label: 'Ecuador', aoi: {key: 73}}
            ]
            const guiRequests = aFakeGuiRequests(() => of(rows))

            const result = read(toolNamed('aoi_list_countries', guiRequests).invoke$({query: 'alb'}, context))

            expect(result).toEqual([{label: 'Albania', aoi: {key: 3}}])
        })

        it('preserves the returned aoi object verbatim — the model must not hand-build it', () => {
            const aoi = {type: 'EE_TABLE', id: 'users/wiell/SepalResources/gaul', keyColumn: 'id', key: 3, level: 'COUNTRY', buffer: 0}
            const guiRequests = aFakeGuiRequests(() => of([{label: 'Albania', aoi}]))

            const [match] = read(toolNamed('aoi_list_countries', guiRequests).invoke$({query: 'Albania'}, context))

            expect(match.aoi).toEqual(aoi)
        })

        it('lets a GUI failure propagate so the specialist can clarify', () => {
            const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('GUI request failed')))

            const error = readError(toolNamed('aoi_list_countries', guiRequests).invoke$({query: 'x'}, context))

            expect(error.message).toBe('GUI request failed')
        })

        it('has a non-empty description (LLM-facing)', () => {
            expect(toolNamed('aoi_list_countries').description.length).toBeGreaterThan(0)
        })
    })

    describe('aoi_list_country_areas', () => {

        it('asks the GUI for the country areas, forwarding the countryId and subscription', () => {
            const guiRequests = aFakeGuiRequests(() => of([]))

            read(toolNamed('aoi_list_country_areas', guiRequests).invoke$({countryId: 3}, context))

            expect(guiRequests.requests).toEqual([{
                clientId: 'c1', subscriptionId: 's1',
                action: 'list-country-areas', params: {countryId: 3}
            }])
        })

        it('filters areas by case-insensitive substring on label', () => {
            const rows = [
                {label: 'Tirana', aoi: {key: 100}},
                {label: 'Durrës', aoi: {key: 101}},
                {label: 'Shkodër', aoi: {key: 102}}
            ]
            const guiRequests = aFakeGuiRequests(() => of(rows))

            const result = read(toolNamed('aoi_list_country_areas', guiRequests).invoke$({countryId: 3, query: 'tir'}, context))

            expect(result).toEqual([{label: 'Tirana', aoi: {key: 100}}])
        })

        it('requires countryId in the schema (specialist must resolve it via aoi_list_countries first)', () => {
            expect(toolNamed('aoi_list_country_areas').parameters.required).toContain('countryId')
        })

        it('has a non-empty description (LLM-facing)', () => {
            expect(toolNamed('aoi_list_country_areas').description.length).toBeGreaterThan(0)
        })
    })

    describe('tool surface placement', () => {

        it('does not expose AOI lookup on the orchestrator surface — specialists own AOI resolution', () => {
            const names = sepalTools({guiRequests: aFakeGuiRequests()}).map(tool => tool.name)

            expect(names).not.toContain('aoi_list_countries')
            expect(names).not.toContain('aoi_list_country_areas')
        })

        it('is in the specialist inner-registry so create/update specialists can call it', () => {
            const names = specialistInnerTools({guiRequests: aFakeGuiRequests()}).map(tool => tool.name)

            expect(names).toContain('aoi_list_countries')
            expect(names).toContain('aoi_list_country_areas')
        })
    })
})
