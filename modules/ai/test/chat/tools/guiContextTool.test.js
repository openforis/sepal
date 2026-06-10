import {guiContextTool} from '#mcp/chat/tools/guiContextTool'

import {read} from '../builders.js'

describe('get_gui_context tool', () => {

    function tool() {
        return guiContextTool()
    }

    it('exposes a no-argument schema', () => {
        expect(tool().parameters).toEqual({
            type: 'object', properties: {}, additionalProperties: false
        })
    })

    it('returns a turn snapshot of the shaped context when context is present', () => {
        const result = read(tool().invoke$({}, {
            guiContext: {section: 'process', selectedRecipe: {recipeId: 'r1', recipeName: 'Mosaic'}}
        }))

        expect(result).toEqual({
            source: 'turn_snapshot',
            available: true,
            guiContext: {section: 'process', selectedRecipe: {recipeId: 'r1', recipeName: 'Mosaic'}}
        })
    })

    it('reports unavailable when the turn context carries no GUI context', () => {
        const result = read(tool().invoke$({}, {}))

        expect(result).toEqual({source: 'turn_snapshot', available: false})
    })

    it('reports unavailable when invoked without a turn context at all', () => {
        const result = read(tool().invoke$({}))

        expect(result).toEqual({source: 'turn_snapshot', available: false})
    })
})
