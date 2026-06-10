import {aToolFactoryHarness} from '../harness.js'

// The provider attaches a counts-only per-call summary to each response; the
// specialist runtime must thread it onto the round's specialist.response event
// so an empty round is self-diagnosing from the AI logs alone (reasoning-burn
// at the cap vs a true empty). Reasoning text never crosses the boundary.
describe('specialist.response reflects the provider per-call summary', () => {

    function emptyRoundResponse(harness) {
        return harness.bus.events
            .filter(event => event.type === 'specialist.response')
            .find(event => event.empty)
    }

    it('carries the round\'s reasoningChars and finishReason on an empty round', () => {
        const harness = aToolFactoryHarness({
            specialist: 'consult_map',
            replies: [
                {text: '', responseMeta: {reasoningChars: 1840, finishReason: 'length'}},
                {text: 'No recipe selected.'}
            ]
        })

        harness.invoke({question: 'why is my map empty?'})

        expect(emptyRoundResponse(harness)).toMatchObject({reasoningChars: 1840, finishReason: 'length'})
    })

    it('distinguishes a true empty round (reasoningChars=0) from reasoning-burn', () => {
        const harness = aToolFactoryHarness({
            specialist: 'consult_map',
            replies: [
                {text: '', responseMeta: {reasoningChars: 0, finishReason: 'stop'}},
                {text: 'No recipe selected.'}
            ]
        })

        harness.invoke({question: 'why is my map empty?'})

        expect(emptyRoundResponse(harness)).toMatchObject({reasoningChars: 0, finishReason: 'stop'})
    })
})
