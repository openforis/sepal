import {of} from 'rxjs'

import {sepalTools, specialistInnerTools} from '#mcp/chat/tools/sepalTools'

import {aFakeGuiRequests} from '../builders.js'

describe('sepal tools', () => {

    it('returns the pure SEPAL product tool list (no specialist-backed tools)', () => {
        const names = sepalTools({guiRequests: aFakeGuiRequests()}).map(tool => tool.name)

        expect([...names].sort()).toEqual([
            'get_gui_context',
            'recipe_list',
            'recipe_open',
            'project_list',
            'map_area_list',
            'layer_list'
        ].sort())
    })

    it('does not expose describe_recipe — that is added at chat-level composition', () => {
        const names = sepalTools({guiRequests: aFakeGuiRequests()}).map(tool => tool.name)

        expect(names).not.toContain('describe_recipe')
    })

    it('does not flag pure SEPAL product tools with directAnswer (the orchestrator restates their structured results — only specialist-backed tools bypass)', () => {
        const tools = sepalTools({guiRequests: aFakeGuiRequests()})

        for (const tool of tools) {
            expect(tool.directAnswer).toBeUndefined()
        }
    })

    it('keeps recipe_load in the specialist inner-registry tool list so the describe specialist can inspect a recipe', () => {
        const names = specialistInnerTools({guiRequests: aFakeGuiRequests(() => of({}))}).map(tool => tool.name)

        expect(names).toContain('recipe_load')
    })

    it('adds update_recipe_values to the specialist inner-registry so the update specialist can apply handle-keyed changes', () => {
        const names = specialistInnerTools({guiRequests: aFakeGuiRequests(() => of({}))}).map(tool => tool.name)

        expect(names).toContain('update_recipe_values')
    })

    it('does not expose update_recipe_values on the orchestrator surface — it is specialist-private', () => {
        const names = sepalTools({guiRequests: aFakeGuiRequests()}).map(tool => tool.name)

        expect(names).not.toContain('update_recipe_values')
    })
})
