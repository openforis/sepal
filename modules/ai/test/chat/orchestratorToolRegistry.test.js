const {createOrchestratorToolRegistry} = require('#mcp/chat/orchestratorToolRegistry')
const {aFakeBus, aFakeGuiRequests, aFakeLlm, aFakeTracer} = require('./builders')

describe('orchestrator tool registry', () => {

    function anOrchestratorSurface() {
        return createOrchestratorToolRegistry({
            guiRequests: aFakeGuiRequests(),
            llm: aFakeLlm(),
            tracer: aFakeTracer(),
            bus: aFakeBus()
        })
    }

    it('exposes the orchestrator-visible tool surface in stable order, with describe_recipe in place of recipe_load', () => {
        const names = anOrchestratorSurface().schemas().map(schema => schema.name)

        expect(names).toEqual([
            'get_context',
            'recipe_list',
            'project_list',
            'map_area_list',
            'layer_list',
            'describe_recipe',
            'consult_map'
        ])
    })

    it('does not expose recipe_load on the orchestrator surface — it is specialist-private', () => {
        const names = anOrchestratorSurface().schemas().map(schema => schema.name)

        expect(names).not.toContain('recipe_load')
    })
})
