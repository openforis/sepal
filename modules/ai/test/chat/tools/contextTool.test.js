const {contextTool} = require('#mcp/chat/tools/contextTool')
const {read} = require('../builders')

describe('get_context tool', () => {

    function tool() {
        return contextTool()
    }

    it('exposes a no-argument schema', () => {
        expect(tool().parameters).toEqual({
            type: 'object', properties: {}, additionalProperties: false
        })
    })

    it('returns a turn snapshot of the shaped selection when context is present', () => {
        const result = read(tool().invoke$({}, {
            selection: {section: 'process', selectedRecipe: {recipeId: 'r1', recipeName: 'Mosaic'}}
        }))

        expect(result).toEqual({
            source: 'turn_snapshot',
            available: true,
            selection: {section: 'process', selectedRecipe: {recipeId: 'r1', recipeName: 'Mosaic'}}
        })
    })

    it('reports unavailable when the turn context carries no selection', () => {
        const result = read(tool().invoke$({}, {}))

        expect(result).toEqual({source: 'turn_snapshot', available: false})
    })

    it('reports unavailable when invoked without a turn context at all', () => {
        const result = read(tool().invoke$({}))

        expect(result).toEqual({source: 'turn_snapshot', available: false})
    })
})
