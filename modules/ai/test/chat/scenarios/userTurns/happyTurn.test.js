import {of} from 'rxjs'

import {
    aControllableLlm, aConversationHarness, collect, createInMemoryHistory, firstValue, run
} from '../../harness.js'
import {projectListSchema, recipeListSchema} from './fixtures.js'

describe('happy turn', () => {

    describe('with a single text reply', () => {
        let harness
        beforeEach(() => {
            harness = aConversationHarness({replies: [{text: 'Hi alice!'}]})
        })

        it('streams the assistant text as a textDelta on the channel', async () => {
            const events = await collect(harness.send$('Hello'))

            expect(events).toContainEqual({textDelta: 'Hi alice!'})
        })

        it('persists the user message and the assistant reply in history', async () => {
            await collect(harness.send$('Hello'))

            const stored = await firstValue(harness.history.load$())
            expect(stored).toEqual([
                {role: 'user', content: 'Hello'},
                {role: 'assistant', content: 'Hi alice!'}
            ])
        })
    })

    describe('with a chunked text reply', () => {
        it('streams each text chunk and persists the assembled assistant message', async () => {
            const harness = aConversationHarness({
                replies: [{textChunks: ['Hi ', 'alice!']}]
            })

            const events = await collect(harness.send$('Hello'))

            expect(events).toEqual([{textDelta: 'Hi '}, {textDelta: 'alice!'}])
            const stored = await firstValue(harness.history.load$())
            expect(stored).toContainEqual({role: 'assistant', content: 'Hi alice!'})
        })
    })

    describe('with initial messages seeded into the conversation', () => {
        it('keeps initial messages in the LLM view without persisting them as chat history', async () => {
            const harness = aConversationHarness({
                replies: [{text: 'ok'}],
                initialMessages: [{role: 'system', content: 'You are Sepalito.'}],
                history: createInMemoryHistory()
            })

            await collect(harness.send$('Hello'))

            expect(harness.llm.receivedMessages[0]).toEqual([
                {role: 'system', content: 'You are Sepalito.'},
                {role: 'user', content: 'Hello'}
            ])
            const stored = await firstValue(harness.history.load$())
            expect(stored).not.toContainEqual({role: 'system', content: 'You are Sepalito.'})
        })
    })

    describe('history projection across turns', () => {

        it('the second turn LLM call sees the completed first-turn user + assistant', async () => {
            const harness = aConversationHarness({
                replies: [{text: 'response one'}, {text: 'response two'}]
            })

            await collect(harness.send$('first'))
            await collect(harness.send$('second'))

            expect(harness.llm.receivedMessages[1]).toEqual([
                {role: 'user', content: 'first'},
                {role: 'assistant', content: 'response one'},
                {role: 'user', content: 'second'}
            ])
        })

        it('does not let a completed tool-using first turn drift the next turn back to the prior tool', async () => {
            const projectCall = {id: 'pc', name: 'project_list', input: {}}
            const recipeCall = {id: 'rc', name: 'recipe_list', input: {}}
            const harness = aConversationHarness({
                replies: [
                    {toolCalls: [projectCall]},
                    {text: 'You have 1 project.'},
                    {toolCalls: [recipeCall]},
                    {text: 'You have 1 recipe.'}
                ],
                tools: [
                    {...projectListSchema, invoke$: () => of({projects: [{id: 'p1', name: 'Kenya'}]})},
                    {...recipeListSchema, invoke$: () => of({recipes: [{id: 'r1', name: 'Mosaic'}]})}
                ]
            })

            await collect(harness.send$('list my projects'))
            await collect(harness.send$('list my recipes'))

            expect(harness.llm.receivedMessages[2]).toEqual([
                {role: 'user', content: 'list my projects'},
                {role: 'assistant', content: 'You have 1 project.'},
                {role: 'user', content: 'list my recipes'}
            ])
        })
    })

    describe('abort persistence', () => {

        it('keeps the user message in history when the turn is aborted before any assistant text', async () => {
            const llm = aControllableLlm()
            const harness = aConversationHarness({llm})

            run(harness.send$('hello'))
            harness.conversation.abort()

            const stored = await firstValue(harness.history.load$())
            expect(stored).toEqual([{role: 'user', content: 'hello'}])
        })
    })

    describe('usage attribution', () => {

        it('tags the orchestrator LLM call with role and conversation so usage accounting can attribute it', async () => {
            const harness = aConversationHarness({id: 'conv-1', replies: [{text: 'Hi!'}]})

            await collect(harness.send$('Hello'))

            expect(harness.llm.receivedRequests[0].usageContext).toMatchObject({
                role: 'orchestrator',
                conversationId: 'conv-1'
            })
        })
    })
})
