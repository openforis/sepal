const {of} = require('rxjs')
const {sepalTools, specialistInnerTools} = require('#mcp/chat/tools/sepalTools')
const {aFakeGuiRequests} = require('../builders')

describe('sepal tools', () => {

    it('returns the pure SEPAL product tool list (no specialist-backed tools)', () => {
        const names = sepalTools({guiRequests: aFakeGuiRequests()}).map(tool => tool.name)

        expect(names).toEqual([
            'get_gui_context',
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

    it('keeps recipe_patch in the specialist inner-registry so the patch specialist can write recipes', () => {
        const names = specialistInnerTools({guiRequests: aFakeGuiRequests(() => of({}))}).map(tool => tool.name)

        expect(names).toContain('recipe_patch')
    })

    it('does not expose recipe_patch on the orchestrator surface — it is specialist-private', () => {
        const names = sepalTools({guiRequests: aFakeGuiRequests()}).map(tool => tool.name)

        expect(names).not.toContain('recipe_patch')
    })

    it('keeps load_for_update in the specialist inner-registry so the update specialist can plan patches', () => {
        const names = specialistInnerTools({guiRequests: aFakeGuiRequests(() => of({}))}).map(tool => tool.name)

        expect(names).toContain('load_for_update')
    })

    it('does not expose load_for_update on the orchestrator surface — it is specialist-private', () => {
        const names = sepalTools({guiRequests: aFakeGuiRequests()}).map(tool => tool.name)

        expect(names).not.toContain('load_for_update')
    })
})
