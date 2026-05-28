const {of} = require('rxjs')
const {createUpdateWorkflow} = require('#mcp/chat/specialists/updateRecipe/updateWorkflow')
const {aRecordingBus, aFakeLlm, aFakeGuiRequests} = require('../../harness')
const {read} = require('../../builders')

describe('update_recipe validation-rescope retry', () => {

    describe('when a VALIDATION_FAILED names a known-but-out-of-scope handle', () => {

        it('consults the updater a second time with that handle in writable scope', () => {
            const harness = aWorkflow()
                .scriptedConsults(failingValidationOn('snowMasking'), succeeding())
                .runIt('set cloud buffer')

            expect(harness.consultCount).toBe(2)
            expect(harness.consultArgsAt(1).packet.writableHandles).toContain('snowMasking')
        })

        it('returns ok=true with the second consult\'s answer', () => {
            const result = aWorkflow()
                .scriptedConsults(failingValidationOn('snowMasking'), succeeding({answer: 'Done.'}))
                .runIt('set cloud buffer').result

            expect(result).toEqual({ok: true, data: {answer: 'Done.'}})
        })

        it('appends a factual rescope note into the retry consult\'s contextText', () => {
            const retryContext = aWorkflow()
                .scriptedConsults(failingValidationOn('snowMasking'), succeeding())
                .runIt('set cloud buffer').consultArgsAt(1).contextText

            expect(retryContext).toMatch(/Previous update attempt failed validation/)
            expect(retryContext).toMatch(/Writable scope was expanded/)
        })

        it('publishes a single update_recipe.outcome reflecting the rescued success', () => {
            const outcomes = aWorkflow()
                .scriptedConsults(failingValidationOn('snowMasking'), succeeding())
                .runIt('set cloud buffer').outcomes

            expect(outcomes).toHaveLength(1)
            expect(outcomes[0]).toMatchObject({patchSucceeded: true, code: 'ok'})
        })

        it('fires update_recipe.prepare.completed for both the initial and rescoped attempt', () => {
            const run = aWorkflow()
                .scriptedConsults(failingValidationOn('snowMasking'), succeeding())
                .runIt('set cloud buffer')

            const prepareEvents = run.eventsOfType('update_recipe.prepare.completed')
            expect(prepareEvents).toHaveLength(2)
            expect(prepareEvents[1].writableHandles).toContain('snowMasking')
        })
    })

    describe('when rescope does not apply', () => {

        it('does not rescope when the failed handle is already writable (value needs fixing, not scope)', () => {
            const harness = aWorkflow()
                .picksHandles('cloudBuffer')
                .scriptedConsults(failingValidationOn('cloudBuffer'))
                .runIt('set cloud buffer')

            expect(harness.consultCount).toBe(1)
            expect(harness.result.error.code).toBe('UPDATE_FAILED')
        })

        it('does not rescope when the failed handle is not in the catalog (model invented it)', () => {
            const harness = aWorkflow()
                .scriptedConsults(failingValidationOn('frobnicate'))
                .runIt('set cloud buffer')

            expect(harness.consultCount).toBe(1)
        })

        it.each(['STALE_WRITE', 'INACTIVE_VALUE', 'TOOL_FAILED'])(
            'does not rescope on %s — picker/closure-miss is not the right model for that failure', code => {
                const harness = aWorkflow()
                    .scriptedConsults(failingWith(code))
                    .runIt('set cloud buffer')

                expect(harness.consultCount).toBe(1)
            }
        )
    })

    describe('at-most-once retry', () => {

        it('does not rescope a second time when the retry itself fails validation on another out-of-scope handle', () => {
            const harness = aWorkflow()
                .scriptedConsults(failingValidationOn('snowMasking'), failingValidationOn('holes'))
                .runIt('set cloud buffer')

            expect(harness.consultCount).toBe(2)
            expect(harness.result.error.code).toBe('UPDATE_FAILED')
        })
    })

    describe('partial success on the rescope retry', () => {

        it('returns ok=true with partialFailure when the retry mixes success with a trailing failure', () => {
            const result = aWorkflow()
                .scriptedConsults(failingValidationOn('snowMasking'), partiallyPatching({trailingFails: 'cloudBuffer'}))
                .runIt('set cloud buffer').result

            expect(result.ok).toBe(true)
            expect(result.data.partialFailure).toMatchObject({code: 'VALIDATION_FAILED'})
        })
    })

    describe('preserves prior patch-attempt semantics across rescope', () => {

        it('reports patchAttempted=true when the retry consult only clarified (no tool call)', () => {
            const outcomes = aWorkflow()
                .scriptedConsults(failingValidationOn('snowMasking'), clarifying())
                .runIt('set cloud buffer').outcomes

            expect(outcomes[0]).toMatchObject({
                patchAttempted: true,
                patchSucceeded: false,
                lastPatchErrorCode: 'VALIDATION_FAILED'
            })
        })

        it('reports patchAttempted=true when the rescope re-prepare fails', () => {
            const outcomes = aWorkflow()
                .withFailingRePrepare()
                .scriptedConsults(failingValidationOn('snowMasking'))
                .runIt('set cloud buffer').outcomes

            expect(outcomes[0]).toMatchObject({
                patchAttempted: true,
                lastPatchErrorCode: 'VALIDATION_FAILED'
            })
        })
    })
})

function failingValidationOn(handle) {
    return aConsult({timeline: [aToolEntry({ok: false, result: aValidationFailureOn(handle)})]})
}

function failingWith(code) {
    return aConsult({timeline: [aToolEntry({ok: false, result: {ok: false, error: {code, message: 'irrelevant',
        handleErrors: [{handle: 'snowMasking', message: '...'}]}}})]})
}

function succeeding({answer = ''} = {}) {
    return aConsult({answer, timeline: [aToolEntry({ok: true, result: aSuccessEnvelope()})]})
}

function clarifying({answer = 'Do you want snow masking?'} = {}) {
    return aConsult({answer, timeline: []})
}

function partiallyPatching({trailingFails}) {
    return aConsult({
        answer: 'Did most of it; one call failed.',
        timeline: [
            aToolEntry({ok: true, result: aSuccessEnvelope()}),
            aToolEntry({ok: false, result: aValidationFailureOn(trailingFails)})
        ]
    })
}

function aConsult({answer = '', finishReason = 'answered', timeline}) {
    return {answer, finishReason, timeline}
}

function aToolEntry({ok, result}) {
    return {kind: 'tool', name: 'update_recipe_values', ok, result, input: {recipeId: 'r1', values: {}}}
}

function aValidationFailureOn(handle) {
    return {ok: false, error: {code: 'VALIDATION_FAILED', message: '1 validation error',
        handleErrors: [{handle, message: 'must be ON when cloudBuffer > 0'}]}}
}

function aSuccessEnvelope() {
    return {ok: true, data: {summary: 'updated', modelHash: 'h-next',
        appliedHandles: ['cloudBuffer', 'snowMasking'], invalidatedHandles: []}}
}

function aWorkflow() {
    let pickedHandles = ['cloudBuffer']
    const consults = []
    let guiRequests = aFakeGuiRequests()

    return {
        picksHandles(...handles) { pickedHandles = handles; return this },
        scriptedConsults(...results) { consults.push(...results); return this },
        withFailingRePrepare() { guiRequests = aGuiThatFailsTheSecondLoad(); return this },
        runIt(request) {
            const bus = aRecordingBus()
            const llm = aFakeLlm({replies: [{text: JSON.stringify({handles: pickedHandles})}]})
            const consultArgs = []
            const updater = {
                consult$(args) {
                    consultArgs.push(args)
                    return of(consults[Math.min(consultArgs.length - 1, consults.length - 1)])
                }
            }
            const workflow = createUpdateWorkflow({llm, bus, guiRequests, innerTools: null, updater})
            const result = read(workflow.run$({recipeId: 'r1', request, context: {conversationId: 'c1'}}))
            return {
                result,
                consultCount: consultArgs.length,
                consultArgsAt: index => consultArgs[index],
                outcomes: bus.events.filter(event => event.type === 'update_recipe.outcome'),
                eventsOfType: type => bus.events.filter(event => event.type === type)
            }
        }
    }
}

function aGuiThatFailsTheSecondLoad() {
    let loads = 0
    return {
        request$(request) {
            if (request.action === 'recipe-metadata') return of({id: 'r1', type: 'MOSAIC', name: 'Kenya'})
            if (request.action === 'load-recipe') {
                loads += 1
                return loads === 1
                    ? of({id: 'r1', type: 'MOSAIC', modelHash: 'h-base', model: aMosaicModel()})
                    : of({id: 'r1', type: 'MOSAIC', model: aMosaicModel()})
            }
            return of({id: 'r1', type: 'MOSAIC'})
        }
    }
}

function aMosaicModel() {
    return {
        dates: {type: 'YEARLY_TIME_SCAN', targetDate: '2024-07-02', seasonStart: '2024-01-01', seasonEnd: '2025-01-01', yearsBefore: 0, yearsAfter: 0},
        sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_9']}},
        sceneSelectionOptions: {type: 'ALL', targetDateWeight: 0},
        compositeOptions: {
            corrections: ['SR', 'BRDF'], brdfMultiplier: 4, filters: [],
            orbitOverlap: 'KEEP', tileOverlap: 'QUICK_REMOVE',
            includedCloudMasking: ['sepalCloudScore', 'landsatCFMask'],
            landsatCFMaskCloudMasking: 'MODERATE', landsatCFMaskCloudShadowMasking: 'MODERATE',
            landsatCFMaskCirrusMasking: 'MODERATE', landsatCFMaskDilatedCloud: 'REMOVE',
            sepalCloudScoreMaxCloudProbability: 30,
            cloudBuffer: 0, holes: 'ALLOW', snowMasking: 'ON', compose: 'MEDOID'
        }
    }
}
