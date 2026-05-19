const {of} = require('rxjs')
const {specialistConsultationTools} = require('#mcp/chat/specialists/specialistConsultationTools')
const {aFakeBus, aFakeLlm, aFakeTools, read} = require('../builders')

describe('specialistConsultationTools', () => {

    const productSchemas = [
        {name: 'get_gui_context', description: 'GUI context.', parameters: {type: 'object', properties: {}}},
        {name: 'recipe_list', description: 'Saved recipes.', parameters: {type: 'object', properties: {}}},
        {name: 'map_area_list', description: 'Map areas.', parameters: {type: 'object', properties: {}}},
        {name: 'layer_list', description: 'Layers per area.', parameters: {type: 'object', properties: {}}}
    ]

    function aMapSpecialist(overrides = {}) {
        const llm = overrides.llm ?? aFakeLlm({replies: [{text: 'Map looks empty.'}]})
        const innerTools = overrides.innerTools ?? aFakeTools(
            {
                get_gui_context: () => of({section: 'process'}),
                map_area_list: () => of({recipeId: 'r1', layout: 'single', areas: []}),
                layer_list: () => of({recipeId: 'r1', areas: []})
            },
            productSchemas
        )
        const tools = specialistConsultationTools({
            llm,
            bus: overrides.bus ?? aFakeBus(),
            innerTools
        })
        return {tools, llm, innerTools}
    }

    it('exposes a consult_map tool with a question schema', () => {
        const {tools} = aMapSpecialist()
        const consultMap = tools.find(tool => tool.name === 'consult_map')

        expect(consultMap).toBeDefined()
        expect(consultMap.description).toMatch(/map/i)
        expect(consultMap.parameters).toEqual({
            type: 'object',
            properties: {question: {type: 'string'}},
            required: ['question'],
            additionalProperties: false
        })
    })

    it('opts into directAnswer so the specialist prose streams directly to the user without an orchestrator restate round (applies to every consult_* tool)', () => {
        const {tools} = aMapSpecialist()
        const consultMap = tools.find(tool => tool.name === 'consult_map')

        expect(consultMap.directAnswer).toBe(true)
    })

    it('throws at construction when an allowed tool is not registered in the inner tool set', () => {
        const innerTools = aFakeTools({}, [{name: 'recipe_list', description: 'r', parameters: {type: 'object'}}])

        expect(() => specialistConsultationTools({
            llm: aFakeLlm(), bus: aFakeBus(), innerTools
        })).toThrow(/get_gui_context/)
    })

    it('seeds the inner LLM with the prompt loaded from llmText/specialists/map.md', () => {
        const {tools, llm} = aMapSpecialist()
        const consultMap = tools.find(tool => tool.name === 'consult_map')

        read(consultMap.invoke$({question: 'why is my map empty?'}, {channel: {}, conversationId: 'c1'}))

        expect(llm.receivedMessages[0][0]).toEqual({
            role: 'system',
            content: expect.stringContaining('map specialist')
        })
    })

    it('forwards the user question to the inner LLM as a user message', () => {
        const {tools, llm} = aMapSpecialist()
        const consultMap = tools.find(tool => tool.name === 'consult_map')

        read(consultMap.invoke$({question: 'why is my map empty?'}, {channel: {}, conversationId: 'c1'}))

        expect(llm.receivedMessages[0][1]).toEqual({role: 'user', content: 'why is my map empty?'})
    })

    it('offers the inner LLM only the allowed tool schemas', () => {
        const {tools, llm} = aMapSpecialist()
        const consultMap = tools.find(tool => tool.name === 'consult_map')

        read(consultMap.invoke$({question: 'q'}, {channel: {}, conversationId: 'c1'}))

        expect(llm.receivedTools[0].map(schema => schema.name).sort())
            .toEqual(['get_gui_context', 'layer_list', 'map_area_list'])
    })

    it('lets the inner LLM call map_area_list through the inner registry', () => {
        const innerToolCall = {id: 'ma1', name: 'map_area_list', input: {}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [innerToolCall]},
            {text: 'Single area, this-recipe.'}
        ]})
        const innerTools = aFakeTools(
            {
                get_gui_context: () => of({}),
                map_area_list: () => of({recipeId: 'r1', layout: 'single', areas: []}),
                layer_list: () => of({recipeId: 'r1', areas: []})
            },
            productSchemas
        )
        const {tools} = aMapSpecialist({llm, innerTools})
        const consultMap = tools.find(tool => tool.name === 'consult_map')

        read(consultMap.invoke$({question: 'which areas?'}, {channel: {}, conversationId: 'c1'}))

        expect(innerTools.invocations).toEqual([innerToolCall])
    })

    it('returns the specialist answer as the tool result data', () => {
        const {tools} = aMapSpecialist({
            llm: aFakeLlm({replies: [{text: 'No recipe is selected.'}]})
        })
        const consultMap = tools.find(tool => tool.name === 'consult_map')

        const result = read(consultMap.invoke$({question: 'why is my map empty?'}, {channel: {}, conversationId: 'c1'}))

        expect(result).toEqual({answer: 'No recipe is selected.'})
    })

    it('refuses non-allowed tool calls coming from the inner LLM, so the specialist can\'t escape its scope', () => {
        const innerCall = {id: 't1', name: 'recipe_list', input: {}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [innerCall]},
            {text: 'Tool blocked.'}
        ]})
        const innerTools = aFakeTools(
            {get_gui_context: () => of({}), recipe_list: () => of({recipes: []})},
            productSchemas
        )
        const {tools} = aMapSpecialist({llm, innerTools})
        const consultMap = tools.find(tool => tool.name === 'consult_map')

        read(consultMap.invoke$({question: 'list recipes'}, {channel: {}, conversationId: 'c1'}))

        expect(innerTools.invocations).toEqual([])
        const toolMessage = llm.receivedMessages[1].find(m => m.role === 'tool')
        expect(toolMessage.toolResults[0].result).toEqual({
            ok: false,
            error: {code: 'TOOL_NOT_ALLOWED', message: expect.stringContaining('recipe_list')}
        })
    })
})
