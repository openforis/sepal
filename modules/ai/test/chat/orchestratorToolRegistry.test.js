const {createOrchestratorToolRegistry} = require('#mcp/chat/orchestratorToolRegistry')
const {aFakeBus, aFakeGuiRequests, aFakeLlm} = require('./builders')

describe('orchestrator tool registry', () => {

    function anOrchestratorSurface() {
        return createOrchestratorToolRegistry({
            guiRequests: aFakeGuiRequests(),
            llm: aFakeLlm(),
            bus: aFakeBus()
        })
    }

    it('merges the specialist-backed recipe-op and consult tools onto the orchestrator surface alongside the product tools', () => {
        const names = anOrchestratorSurface().schemas().map(schema => schema.name)

        const allExpectedNames = [
            'get_gui_context',
            'recipe_list',
            'recipe_open',
            'project_list',
            'map_area_list',
            'layer_list',
            'describe_recipe',
            'update_recipe',
            'consult_map'
        ]

        expect([...names].sort()).toEqual([...allExpectedNames].sort())
    })

    it('does not expose recipe_load on the orchestrator surface — it is specialist-private', () => {
        const names = anOrchestratorSurface().schemas().map(schema => schema.name)

        expect(names).not.toContain('recipe_load')
    })

    it('does not expose recipe_patch on the orchestrator surface — it is specialist-private', () => {
        const names = anOrchestratorSurface().schemas().map(schema => schema.name)

        expect(names).not.toContain('recipe_patch')
    })

    it('does not expose prepare_update on the orchestrator surface — it is specialist-private', () => {
        const names = anOrchestratorSurface().schemas().map(schema => schema.name)

        expect(names).not.toContain('prepare_update')
    })
})
