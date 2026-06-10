import {publishToolCall} from '#mcp/chat/conversation/conversationEvents'

import {aFakeBus} from '../builders.js'

describe('publishToolCall — orchestrator tool-call diagnostics', () => {

    const diagnostics = {summarizeObject: () => ''}

    function publish(toolCall) {
        const bus = aFakeBus()
        publishToolCall({bus, diagnostics, conversationId: 'c1', round: 0, toolCall})
        return {
            debug: bus.published.find(event => event.type === 'conversation.llmToolCall'),
            trace: bus.published.find(event => event.type === 'conversation.llmToolCallPayload')
        }
    }

    describe('routing identifiers surface in the debug summary so wrong-routing is visible', () => {

        it.each([
            ['update_recipe', {recipeId: 'r1', request: 'x'}, 'recipeId=r1'],
            ['describe_recipe', {recipeId: 'r1'}, 'recipeId=r1'],
            ['create_recipe', {recipeType: 'MOSAIC', instruction: 'x'}, 'recipeType=MOSAIC']
        ])('%s exposes %s', (name, input, expected) => {
            expect(publish({id: 't1', name, input}).debug.inputSummary).toContain(expected)
        })
    })

    describe('free user text rides as chars + hash, never raw', () => {

        it.each([
            {label: 'update_recipe.request', name: 'update_recipe', input: {recipeId: 'r1', request: 'speed up rendering'}, field: 'request', text: 'speed up rendering'},
            {label: 'update_recipe.context', name: 'update_recipe', input: {recipeId: 'r1', request: 'x', context: 'follow-up to slow rendering'}, field: 'context', text: 'follow-up to slow rendering'},
            {label: 'describe_recipe.question', name: 'describe_recipe', input: {recipeId: 'r1', question: 'why might it be slow?'}, field: 'question', text: 'why might it be slow?'},
            {label: 'create_recipe.request', name: 'create_recipe', input: {recipeType: 'MOSAIC', instruction: 'cloud-masked yearly Albania mosaic'}, field: 'request', text: 'cloud-masked yearly Albania mosaic'}
        ])('$label is chars+hash, never the raw text', ({name, input, field, text}) => {
            const summary = publish({id: 't1', name, input}).debug.inputSummary

            expect(summary).toContain(`${field}Chars=${text.length}`)
            expect(summary).toMatch(new RegExp(`${field}Hash=[0-9a-f]{8}`))
            expect(summary).not.toContain(text)
        })
    })

    describe('optional text fields', () => {

        it('omits context fields entirely when the context is missing or whitespace', () => {
            const summary = publish({id: 't1', name: 'update_recipe', input: {recipeId: 'r1', request: 'x', context: '   '}}).debug.inputSummary

            expect(summary).not.toMatch(/context(Chars|Hash)?=/)
        })
    })

    describe('required text fields', () => {

        it('marks request as <missing> when neither request nor instruction is supplied', () => {
            const summary = publish({id: 't1', name: 'update_recipe', input: {recipeId: 'r1'}}).debug.inputSummary

            expect(summary).toContain('request=<missing>')
            expect(summary).not.toMatch(/requestHash=/)
        })

        it('falls back to the legacy `instruction` field when `request` is absent', () => {
            const summary = publish({id: 't1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'legacy ask'}}).debug.inputSummary

            expect(summary).toMatch(/requestChars=10\b/)
            expect(summary).not.toContain('legacy ask')
        })
    })

    describe('unrecognised tools', () => {

        it('summarise to a sorted inputKeys list rather than per-tool fields', () => {
            const summary = publish({id: 't1', name: 'map_set_camera', input: {lat: 42, lng: 19, zoom: 8}}).debug.inputSummary

            expect(summary).toBe('inputKeys=[lat,lng,zoom]')
        })
    })

    describe('debug + trace split', () => {

        it('publishes one debug summary and one trace payload event per tool call', () => {
            const {debug, trace} = publish({id: 't1', name: 'update_recipe', input: {recipeId: 'r1', request: 'fix it'}})

            expect(debug.level).toBe('debug')
            expect(trace.level).toBe('trace')
        })
    })
})
