const {of} = require('rxjs')
const {productTools, specialistInnerTools} = require('#mcp/chat/tools/productTools')
const {createToolRegistry} = require('#mcp/chat/tools/registry')
const {aFakeBus, aFakeGuiRequests, aFakeLlm, aFakeTracer} = require('../builders')

describe('product tools', () => {

    function aProductSurface() {
        const guiRequests = aFakeGuiRequests()
        const innerTools = createToolRegistry({tools: specialistInnerTools({guiRequests}), bus: aFakeBus()})
        return productTools({guiRequests, llm: aFakeLlm(), tracer: aFakeTracer(), innerTools})
    }

    it('exposes the orchestrator-visible tool surface in stable order, with describe_recipe in place of recipe_load', () => {
        const names = aProductSurface().map(tool => tool.name)

        expect(names).toEqual([
            'get_context',
            'recipe_list',
            'project_list',
            'describe_recipe',
            'map_area_list',
            'layer_list'
        ])
    })

    it('does not expose recipe_load on the orchestrator surface — it is specialist-private', () => {
        const names = aProductSurface().map(tool => tool.name)

        expect(names).not.toContain('recipe_load')
    })

    it('keeps recipe_load in the specialist inner-registry tool list so specialists can inspect a recipe', () => {
        const names = specialistInnerTools({guiRequests: aFakeGuiRequests(() => of({}))}).map(tool => tool.name)

        expect(names).toContain('recipe_load')
    })
})
