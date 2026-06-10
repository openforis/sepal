import {of} from 'rxjs'

import {createToolRegistry} from '#mcp/chat/tools/registry'

import {aFakeBus, read} from '../builders.js'

describe('tool registry — result diagnostics', () => {

    const echoTool = {
        name: 'echo',
        description: 'Echo input text.',
        parameters: {
            type: 'object',
            properties: {text: {type: 'string'}},
            required: ['text'],
            additionalProperties: false
        },
        invoke$: input => of({echoed: input.text})
    }

    let bus
    beforeEach(() => {
        bus = aFakeBus()
    })

    it('publishes a debug tool-result event with the result kind for a successful object result, and a trace payload', () => {
        const registry = createToolRegistry({tools: [echoTool], bus})

        read(registry.invoke$({id: 'c1', name: 'echo', input: {text: 'hi'}}, {conversationId: 'conv-1'}))

        expect(debugEvents(bus.published)).toMatchObject([{
            type: 'tool.result',
            level: 'debug',
            conversationId: 'conv-1',
            toolName: 'echo',
            ok: true,
            kind: 'object'
        }])
        expect(traceEvents(bus.published)[0]).toMatchObject({
            type: 'tool.resultPayload',
            level: 'trace',
            conversationId: 'conv-1',
            toolName: 'echo'
        })
    })

    it('reports count, first-item keys, and named-item count for an array result', () => {
        const listTool = {
            name: 'recipe_list',
            description: 'x',
            parameters: {type: 'object', properties: {}, additionalProperties: true},
            invoke$: () => of([
                {id: 'r1', type: 'MOSAIC', name: 'Kenya'},
                {id: 'r2', type: 'MOSAIC', name: 'Sudan'},
                {id: 'r3', type: 'MOSAIC'}
            ])
        }
        const registry = createToolRegistry({tools: [listTool], bus})

        read(registry.invoke$({id: 'c1', name: 'recipe_list', input: {}}, {conversationId: 'conv-1'}))

        expect(debugEvents(bus.published)[0]).toMatchObject({
            ok: true,
            kind: 'array',
            count: 3,
            firstItemKeys: ['id', 'type', 'name'],
            namedCount: 2
        })
    })

    it('reports the error code for a failed tool', () => {
        const registry = createToolRegistry({tools: [echoTool], bus})

        read(registry.invoke$({id: 'c1', name: 'missing', input: {}}, {conversationId: 'conv-1'}))

        expect(debugEvents(bus.published)[0]).toMatchObject({
            type: 'tool.result',
            level: 'debug',
            conversationId: 'conv-1',
            toolName: 'missing',
            ok: false,
            errorCode: 'UNKNOWN_TOOL'
        })
    })

    it('projects structured validation errors (path/rule/message) into errorSummary on a failed tool result', () => {
        const envelopeTool = {
            name: 'envelope_tool',
            description: 'x',
            parameters: {type: 'object', properties: {}, additionalProperties: true},
            invoke$: () => of({
                ok: false,
                error: {
                    code: 'VALIDATION_FAILED',
                    message: 'validation failed',
                    errors: [{path: '/dates/seasonStart', rule: 'seasonStartWindow', message: 'must be in window'}]
                }
            })
        }
        const registry = createToolRegistry({tools: [envelopeTool], bus})

        read(registry.invoke$({id: 'c1', name: 'envelope_tool', input: {}}, {conversationId: 'conv-1'}))

        const resultEvent = debugEvents(bus.published)[0]
        expect(resultEvent).toMatchObject({type: 'tool.result', ok: false, errorCode: 'VALIDATION_FAILED'})
        expect(JSON.parse(resultEvent.errorSummary)).toEqual([
            {path: '/dates/seasonStart', rule: 'seasonStartWindow', message: 'must be in window'}
        ])
    })
})

function debugEvents(events) {
    return events.filter(event => event.level === 'debug')
}

function traceEvents(events) {
    return events.filter(event => event.level === 'trace')
}
