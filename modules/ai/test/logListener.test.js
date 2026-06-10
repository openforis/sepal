import {jest} from '@jest/globals'
import {Subject} from 'rxjs'

import logConfig from '#config/log.json' with {type: 'json'}

jest.unstable_mockModule('#sepal/log', () => ({getLogger: jest.fn()}))

const {onEvent, categoryOf, subscribeLogListener} = await import('#mcp/logListener')
const {getLogger} = await import('#sepal/log')

describe('Log listener', () => {

    let logs, loggerFor

    beforeEach(() => {
        logs = []
        loggerFor = category => ({
            info: line => logs.push({category, level: 'info', line}),
            warn: line => logs.push({category, level: 'warn', line}),
            error: line => logs.push({category, level: 'error', line}),
            trace: line => logs.push({category, level: 'trace', line})
        })
    })

    describe('onEvent', () => {

        it('logs an event\'s message at its declared level', () => {
            onEvent(loggerFor, {type: 'wsIn', level: 'info', message: 'WS in c1:s1 (alice) create-conversation'})

            expect(logs).toEqual([{category: 'ws', level: 'info', line: 'WS in c1:s1 (alice) create-conversation'}])
        })

        it('logs warn-level events at warn', () => {
            onEvent(loggerFor, {type: 'wsIn', level: 'warn', message: 'WS in c1:s1 (alice) unknown data type: foo (ignored)'})

            expect(logs).toEqual([{category: 'ws', level: 'warn', line: 'WS in c1:s1 (alice) unknown data type: foo (ignored)'}])
        })

        it('passes lazy message functions through to the logger', () => {
            const message = () => 'expensive log line'

            onEvent(loggerFor, {type: 'conversation.historyProjectionPayload', level: 'trace', message})

            expect(logs).toEqual([{category: 'conversation', level: 'trace', line: message}])
        })

        it('logs error-level events at error', () => {
            onEvent(loggerFor, {type: 'tool.invoke.failed', level: 'error', message: 'tool invoke failed: boom'})

            expect(logs).toEqual([{category: 'tool', level: 'error', line: 'tool invoke failed: boom'}])
        })

        it('ignores events without a level or message (e.g. internal-only events)', () => {
            onEvent(loggerFor, {type: 'internal'})

            expect(logs).toEqual([])
        })

        it('default-formats a structured event (type action context metrics) when it carries no explicit message', () => {
            onEvent(loggerFor, {
                type: 'turn.usage', level: 'info', action: 'summarized',
                context: {conversationId: 'conv-1', turnId: 'turn-1'},
                metrics: {calls: 6, inputTokens: 25822, exactCalls: '6/6', llmDurationMs: 40599}
            })

            expect(logs).toEqual([{
                category: 'turn', level: 'info',
                line: 'turn.usage summarized conversationId=conv-1 turnId=turn-1 calls=6 inputTokens=25822 exactCalls=6/6 llmDurationMs=40599'
            }])
        })

        it('keeps an explicit message as the escape hatch even when structured fields are present', () => {
            onEvent(loggerFor, {
                type: 'turn.usage', level: 'info', action: 'summarized',
                context: {conversationId: 'conv-1'}, metrics: {calls: 1},
                message: 'explicit message wins'
            })

            expect(logs).toEqual([{category: 'turn', level: 'info', line: 'explicit message wins'}])
        })

        it('omits null/undefined context and metric values but keeps zeros', () => {
            onEvent(loggerFor, {
                type: 'conversation.usage', level: 'info', action: 'updated',
                context: {conversationId: 'conv-1', turnId: null},
                metrics: {calls: 11, cachedInputTokens: 0}
            })

            expect(logs[0].line).toBe('conversation.usage updated conversationId=conv-1 calls=11 cachedInputTokens=0')
        })

        it('does not log a level-only event that is neither a message nor structured', () => {
            onEvent(loggerFor, {type: 'internal', level: 'info'})

            expect(logs).toEqual([])
        })
    })

    describe('categoryOf — routing rules', () => {

        it('uses the first dot-segment of a dotted event type', () => {
            expect(categoryOf({type: 'conversation.historyProjection'})).toBe('conversation')
            expect(categoryOf({type: 'llm.chunk'})).toBe('llm')
            expect(categoryOf({type: 'gui.request'})).toBe('gui')
            expect(categoryOf({type: 'title.failed'})).toBe('title')
            expect(categoryOf({type: 'tool.result'})).toBe('tool')
            expect(categoryOf({type: 'userChat.unknownCommand'})).toBe('userChat')
        })

        it('routes span events to their first segment (kind.subkind.started → kind)', () => {
            expect(categoryOf({type: 'conversation.send.started'})).toBe('conversation')
            expect(categoryOf({type: 'llm.respondTo.completed'})).toBe('llm')
            expect(categoryOf({type: 'tool.invoke.failed'})).toBe('tool')
            expect(categoryOf({type: 'userChat.handle.completed'})).toBe('userChat')
            expect(categoryOf({type: 'title.generate.started'})).toBe('title')
            expect(categoryOf({type: 'specialist.run.completed'})).toBe('specialist')
        })

        it('routes orchestrator.prompt to the orchestrator category', () => {
            expect(categoryOf({type: 'orchestrator.prompt'})).toBe('orchestrator')
        })

        it('routes specialist.prompt and the per-round/per-tool specialist events to the specialist category', () => {
            expect(categoryOf({type: 'specialist.prompt'})).toBe('specialist')
            expect(categoryOf({type: 'specialist.request'})).toBe('specialist')
            expect(categoryOf({type: 'specialist.response'})).toBe('specialist')
            expect(categoryOf({type: 'specialist.tool.request'})).toBe('specialist')
            expect(categoryOf({type: 'specialist.tool.response'})).toBe('specialist')
        })

        it('routes update_recipe.outcome to the update_recipe category', () => {
            expect(categoryOf({type: 'update_recipe.outcome'})).toBe('update_recipe')
        })

        it('routes a two-segment domain event whose second segment looks like a span suffix to its prefix', () => {
            // Regression: 'title.failed' is a domain event from titleGenerator, not a span.
            // It must still bucket to the title category, not get its tail stripped away.
            expect(categoryOf({type: 'title.failed'})).toBe('title')
        })

        it('maps the un-prefixed WS events to the ws category', () => {
            expect(categoryOf({type: 'wsIn'})).toBe('ws')
            expect(categoryOf({type: 'wsOut'})).toBe('ws')
            expect(categoryOf({type: 'wsConnectionError'})).toBe('ws')
            expect(categoryOf({type: 'wsRouteError'})).toBe('ws')
            expect(categoryOf({type: 'workFailed'})).toBe('ws')
        })

        it('falls back to ai for unknown un-prefixed types and missing type', () => {
            expect(categoryOf({type: 'mystery'})).toBe('ai')
            expect(categoryOf({})).toBe('ai')
        })

        it('still uses the dotted prefix for unknown dotted types — declaring a new subsystem is a log.json concern', () => {
            expect(categoryOf({type: 'redis.connected'})).toBe('redis')
            expect(categoryOf({type: 'newSubsystem.event.completed'})).toBe('newSubsystem')
        })
    })

    describe('log.json declares categories for every routed subsystem (so log level can be opted-into cleanly)', () => {

        it('declares orchestrator — orchestrator.prompt routes here and must be settable independently of conversation', () => {
            expect(logConfig.categories).toHaveProperty('orchestrator')
        })

        it('declares update_recipe — update_recipe.outcome routes here and must be settable independently of specialist', () => {
            expect(logConfig.categories).toHaveProperty('update_recipe')
        })

        it('declares turn — turn.usage rollups route here and must be settable independently of conversation', () => {
            expect(logConfig.categories).toHaveProperty('turn')
        })
    })

    describe('subscribeLogListener — bus to log4js wiring', () => {
        let bus, loggers
        beforeEach(() => {
            loggers = new Map()
            getLogger.mockReset()
            getLogger.mockImplementation(category => {
                if (!loggers.has(category)) {
                    loggers.set(category, {info: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn()})
                }
                return loggers.get(category)
            })
            bus = {events$: new Subject()}
        })

        it('routes a published event to its category logger at the declared level', () => {
            subscribeLogListener({bus})

            bus.events$.next({type: 'tool.invoke.failed', level: 'error', message: 'boom'})

            expect(loggers.get('tool').error).toHaveBeenCalledWith('boom')
        })

        it('resolves a category logger once across repeated events of that category', () => {
            subscribeLogListener({bus})

            bus.events$.next({type: 'tool.one', level: 'info', message: 'a'})
            bus.events$.next({type: 'tool.two', level: 'info', message: 'b'})

            expect(getLogger.mock.calls.filter(([category]) => category === 'tool')).toHaveLength(1)
        })
    })
})
