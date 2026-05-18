const {of} = require('rxjs')
const {sepalTools, specialistInnerTools} = require('#mcp/chat/tools/sepalTools')
const {aFakeGuiRequests} = require('../builders')

describe('sepal tools', () => {

    it('returns the pure SEPAL product tool list (no specialist-backed tools)', () => {
        const names = sepalTools({guiRequests: aFakeGuiRequests()}).map(tool => tool.name)

        expect(names).toEqual([
            'get_context',
            'recipe_list',
            'recipe_open',
            'project_list',
            'map_area_list',
            'layer_list'
        ])
    })

    it('does not expose describe_recipe — that is added at chat-level composition', () => {
        const names = sepalTools({guiRequests: aFakeGuiRequests()}).map(tool => tool.name)

        expect(names).not.toContain('describe_recipe')
    })

    it('keeps recipe_load in the specialist inner-registry tool list so specialists can inspect a recipe', () => {
        const names = specialistInnerTools({guiRequests: aFakeGuiRequests(() => of({}))}).map(tool => tool.name)

        expect(names).toContain('recipe_load')
    })
})
