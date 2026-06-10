import {
    publishSpecialistRequest,
    publishSpecialistResponse,
    publishSpecialistToolRequest,
    publishSpecialistToolResponse
} from '#mcp/chat/specialists/specialistRuntimeEvents'

import {aRecordingBus} from '../harness.js'

describe('publishSpecialistRequest', () => {

    it('publishes a debug-level event carrying name, round, message count, and tool names', () => {
        const bus = aRecordingBus()

        publishSpecialistRequest({
            bus, name: 'recipe.update', round: 0, conversationId: 'c1',
            messages: [{role: 'system', content: 's'}, {role: 'user', content: 'u'}],
            toolSchemas: [{name: 'update_recipe_values'}]
        })

        expect(bus.events[0]).toMatchObject({
            type: 'specialist.request',
            level: 'debug',
            conversationId: 'c1',
            name: 'recipe.update',
            round: 0,
            messageCount: 2,
            toolNames: ['update_recipe_values']
        })
    })
})

describe('publishSpecialistResponse', () => {

    it('emits textChars and toolCallNames at debug level', () => {
        const bus = aRecordingBus()

        publishSpecialistResponse({
            bus, name: 'recipe.update', round: 0, text: 'Done.',
            toolCalls: [{id: 't1', name: 'update_recipe_values'}]
        })

        expect(bus.events[0]).toMatchObject({
            type: 'specialist.response',
            level: 'debug',
            textChars: 5,
            toolCallNames: ['update_recipe_values'],
            empty: false
        })
    })

    it('flags empty=true when the round produced no text and no tool calls', () => {
        const bus = aRecordingBus()

        publishSpecialistResponse({bus, name: 'recipe.update', round: 1, text: '', toolCalls: []})

        expect(bus.events[0].empty).toBe(true)
    })

    // reasoningChars + finishReason distinguish reasoning-burn (length cap on
    // an empty-content round) from a true empty round; both ride the same
    // event so the diagnostic is self-contained.
    it('carries reasoningChars + finishReason for self-diagnosing empty rounds', () => {
        const bus = aRecordingBus()

        publishSpecialistResponse({
            bus, name: 'recipe.update', round: 1, text: '', toolCalls: [],
            reasoningChars: 1840, finishReason: 'length'
        })

        expect(bus.events[0]).toMatchObject({empty: true, reasoningChars: 1840, finishReason: 'length'})
    })

})

describe('publishSpecialistToolRequest', () => {

    it('exposes input keys and a tool-specific summary for update_recipe_values', () => {
        const bus = aRecordingBus()

        publishSpecialistToolRequest({
            bus, name: 'recipe.update', conversationId: 'c1',
            toolCall: {id: 'tu1', name: 'update_recipe_values', input: {
                recipeId: 'r1', baseModelHash: '01234567-89ab',
                writableHandles: ['datasets'], values: {datasets: {LANDSAT: ['LANDSAT_9']}}
            }}
        })

        const event = bus.events[0]
        expect(event).toMatchObject({
            type: 'specialist.tool.request',
            level: 'debug',
            tool: 'update_recipe_values',
            inputKeys: ['recipeId', 'baseModelHash', 'writableHandles', 'values']
        })
        expect(event.inputSummary).toContain('recipeId=r1')
        expect(event.inputSummary).toContain('baseModelHash=01234567')
        expect(event.inputSummary).toContain('handles=[datasets]')
    })

    it('summarises aoi_list_countries with the query as chars+hash, never raw user text', () => {
        const bus = aRecordingBus()
        const query = 'cote-divoire-secret-marker-9182'

        publishSpecialistToolRequest({
            bus, name: 'recipe.update',
            toolCall: {id: 'tq1', name: 'aoi_list_countries', input: {query}}
        })

        const event = bus.events[0]
        expect(event.inputSummary).toContain(`queryChars=${query.length}`)
        expect(event.inputSummary).toMatch(/queryHash=[0-9a-f]{8}/)
        expect(event.inputSummary).not.toContain(query)
    })

    it('renders a dash when no handle values were submitted', () => {
        const bus = aRecordingBus()

        publishSpecialistToolRequest({
            bus, name: 'recipe.update',
            toolCall: {id: 'tu1', name: 'update_recipe_values', input: {recipeId: 'r1', baseModelHash: 'h', values: {}}}
        })

        expect(bus.events[0].inputSummary).toContain('handles=[-]')
    })

})

describe('publishSpecialistToolResponse', () => {

    it('publishes a shape summary on success', () => {
        const bus = aRecordingBus()
        const envelope = {ok: true, data: {
            summary: 'updated',
            modelHash: 'h2-deadbeef-xx',
            appliedHandles: ['datasets', 'corrections'],
            invalidatedHandles: ['cloudMethods']
        }}

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'update_recipe_values', envelope})

        const event = bus.events[0]
        expect(event).toMatchObject({ok: true, tool: 'update_recipe_values'})
        expect(event.shape).toContain('modelHash=h2-deadb')
        expect(event.shape).toContain('applied=2[datasets,corrections]')
        expect(event.shape).toContain('invalidated=1[cloudMethods]')
    })

    it('publishes error code + message on failure', () => {
        const bus = aRecordingBus()
        const envelope = {ok: false, error: {
            code: 'HANDLE_OUT_OF_SCOPE',
            message: 'Handle(s) not in writableHandles: snowMasking'
        }}

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'update_recipe_values', envelope})

        expect(bus.events[0]).toMatchObject({
            ok: false,
            errorCode: 'HANDLE_OUT_OF_SCOPE',
            errorMessage: 'Handle(s) not in writableHandles: snowMasking'
        })
    })

    it('flattens validation handleErrors as a structured field on the event', () => {
        const bus = aRecordingBus()
        const envelope = {ok: false, error: {
            code: 'VALIDATION_FAILED',
            handleErrors: [
                {handle: 'corrections', message: 'cross-sensor calibration requires both source groups'},
                {handle: 'cloudMethods', message: 'Cloud Score+ requires Sentinel-2'}
            ]
        }}

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'update_recipe_values', envelope})

        expect(bus.events[0].handleErrors).toEqual([
            {handle: 'corrections', message: 'cross-sensor calibration requires both source groups'},
            {handle: 'cloudMethods', message: 'Cloud Score+ requires Sentinel-2'}
        ])
    })

    it('renders "?" in the message for handleErrors with no handle (pathless detail)', () => {
        const bus = aRecordingBus()
        const envelope = {ok: false, error: {
            code: 'VALIDATION_FAILED',
            handleErrors: [{handle: null, message: 'pathless detail'}]
        }}

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'update_recipe_values', envelope})

        expect(bus.events[0].message).toContain('?: pathless detail')
    })

    it('falls back to a generic shape (object/array/null) for unfamiliar tools', () => {
        const bus = aRecordingBus()

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'unfamiliar_tool', envelope: {ok: true, data: {x: 1}}})

        expect(bus.events[0].shape).toBe('object')
    })
})
