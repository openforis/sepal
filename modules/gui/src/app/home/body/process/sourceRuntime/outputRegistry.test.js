import {Observable, Subject} from 'rxjs'
import {describe, expect, it} from 'vitest'

import {buildMapDependencyGraph} from '../recipe/mapDependencyGraph'
import {recipeContent} from '../recipe/recipeContent'
import {compatibleBasis, outputLoading, readRecipeOutput} from '../recipe/recipeOutput'
import {OutputRegistry} from './outputRegistry'

// Who watches which output question, and the description loading shared between them. The session, the clock and the
// runtime operations are controllable; which work a question needs is decided by the real common read over the real
// shared declarations, so a question is shared, local or loaded exactly as it would be for a map layer or Retrieve.
//
// A consumer is represented by what it does: it watches a question and reads it through `heldFor`. Statuses, kinds and
// error codes are literals, so a production rename cannot pass unnoticed.

describe('watching a question', () => {
    it('loads nothing for a question the session answers alone', () => {
        const session = sessionOf([remappingOverAsset()])

        session.watch(canonical('remapping-1'))

        expect(session.operations).toEqual([])
        expect(session.read(canonical('remapping-1')).status).toBe('READY')
    })

    it('shares one load between a map layer and Retrieve asking the same question', () => {
        const session = sessionOf([bandMath()])
        const map = session.watch(canonical('band-math-1'))
        const retrieve = session.watch(canonical('band-math-1'))

        session.settle(session.operations[0], described(bandMath()))

        expect(session.operations.map(({kind}) => kind)).toEqual(['DESCRIBE'])
        expect(session.read(canonical('band-math-1')).status).toBe('READY')
        expect([map.notified(), retrieve.notified()]).toEqual([1, 1])
    })

    it('keeps canonical output, named products and their parameters apart, while sharing equal work', () => {
        const session = sessionOf([changeAlerts()])

        session.watch(collectionMosaic('monitoring'))
        session.watch(collectionMosaic('calibration'))
        session.watch(canonical('change-alerts-1'))

        expect(session.operations.map(({kind}) => kind)).toEqual(['DEPENDENCIES', 'DESCRIBE'])
    })

    it('loads nothing again for a restyle or a title', () => {
        const session = sessionOf([bandMath()])
        session.watch(canonical('band-math-1'))
        session.settle(session.operations[0], described(bandMath()))

        session.edit({...bandMath(), title: 'renamed', layers: {restyled: true}})

        expect(session.operations).toHaveLength(1)
        expect(session.read(canonical('band-math-1')).status).toBe('READY')
    })
})

describe('closing a consumer', () => {
    it.each([
        ['the map layer', 0],
        ['Retrieve', 1]
    ])('leaves work the other still needs running when %s closes first', (_consumer, closing) => {
        const session = sessionOf([bandMath()])
        const consumers = [session.watch(canonical('band-math-1')), session.watch(canonical('band-math-1'))]

        consumers[closing].release()
        expect(session.operations[0].torndown).toBe(false)
        session.settle(session.operations[0], described(bandMath()))

        expect(session.read(canonical('band-math-1')).status).toBe('READY')
    })

    it('cancels and discards unfinished work once every question sharing it has left', () => {
        const session = sessionOf([changeAlerts()])
        const monitoring = session.watch(collectionMosaic('monitoring'))
        const calibration = session.watch(collectionMosaic('calibration'))

        monitoring.release()
        expect(session.operations[0].torndown).toBe(false)
        calibration.release()
        session.watch(collectionMosaic('monitoring'))

        expect(session.operations[0].torndown).toBe(true)
        expect(session.operations).toHaveLength(2)
    })
})

describe('an edit', () => {
    it('withdraws the answer before any watch has reacted to it', () => {
        const session = sessionOf([bandMath()])
        session.watch(canonical('band-math-1'))
        session.settle(session.operations[0], described(bandMath()))

        session.editUnheard(edited(bandMath()))

        expect(session.read(canonical('band-math-1')).status).toBe('NEEDS_EVIDENCE')
    })

    it('never installs a late answer for the key it replaced', () => {
        const session = sessionOf([bandMath()])
        session.watch(canonical('band-math-1'))
        session.edit(edited(bandMath()))

        session.settle(session.operations[0], described(bandMath()))

        expect(session.operations[0].torndown).toBe(true)
        expect(session.read(canonical('band-math-1')).status).toBe('NEEDS_EVIDENCE')
        session.settle(session.operations[1], described(edited(bandMath())))
        expect(session.read(canonical('band-math-1')).status).toBe('READY')
    })

    it('tells the consumers whose answer it withdraws, and no one else', () => {
        const session = sessionOf([bandMath('a'), bandMath('b')])
        const [a, b] = [session.watch(canonical('a')), session.watch(canonical('b'))]
        session.settle(session.operations[0], described(bandMath('a')))
        session.settle(session.operations[1], described(bandMath('b')))

        session.edit(edited(bandMath('a')))

        expect([a.notified(), b.notified()]).toEqual([2, 1])
    })

    it('tells a consumer whose question the session now answers alone', () => {
        const session = sessionOf([changeAlerts()])
        const consumer = session.watch(collectionMosaic('monitoring'))

        session.edit(ccdc())

        expect(session.operations[0].torndown).toBe(true)
        expect(consumer.notified()).toBe(1)
    })

    it('is heard for every watched question, even when another is watched before it is heard', () => {
        const session = sessionOf([bandMath('a'), bandMath('b')])
        session.watch(canonical('a'))
        session.settle(session.operations[0], described(bandMath('a')))
        session.editUnheard(edited(bandMath('a')))

        session.watch(canonical('b'))
        session.hearChange()

        expect(session.operations.map(({recipe}) => recipe.id)).toEqual(['a', 'b', 'a'])
    })
})

describe('replaced credentials', () => {
    it('withdraw every answer before any watch has reacted to them', () => {
        const session = sessionOf([bandMath()])
        session.watch(canonical('band-math-1'))
        session.settle(session.operations[0], described(bandMath()))

        session.replaceCredentialsUnheard()

        expect(session.read(canonical('band-math-1')).status).toBe('NEEDS_EVIDENCE')
    })

    it('reload a question two consumers share once, telling both', () => {
        const session = sessionOf([bandMath()])
        const consumers = [session.watch(canonical('band-math-1')), session.watch(canonical('band-math-1'))]
        session.settle(session.operations[0], described(bandMath()))

        session.replaceCredentials()

        expect(session.operations).toHaveLength(2)
        expect(consumers.map(consumer => consumer.notified())).toEqual([2, 2])
    })

    it('reload once when the operation reports them before the session change is heard', () => {
        const session = sessionOf([bandMath()])
        session.watch(canonical('band-math-1'))

        session.replaceCredentialsUnheard()
        session.settle(session.operations[0], failed(bandMath(), 'SOURCE_IDENTITY_CHANGED'))
        session.hearChange()

        expect(session.operations).toHaveLength(2)
        expect(session.read(canonical('band-math-1')).status).toBe('NEEDS_EVIDENCE')
    })

    it('discard retained answers, which are not reloaded until watched again', () => {
        const session = sessionOf([bandMath()])
        const consumer = session.watch(canonical('band-math-1'))
        session.settle(session.operations[0], described(bandMath()))
        consumer.release()

        session.replaceCredentials()
        expect(session.operations).toHaveLength(1)
        session.watch(canonical('band-math-1'))

        expect(session.operations).toHaveLength(2)
    })
})

describe('a failed load', () => {
    it('is held for every consumer rather than left pending', () => {
        const session = sessionOf([bandMath()])
        session.watch(canonical('band-math-1'))
        session.watch(canonical('band-math-1'))

        session.settle(session.operations[0], failed(bandMath()))

        expect(session.read(canonical('band-math-1')).status).toBe('UNAVAILABLE')
    })

    it('is not loaded again because another consumer joins or anything reads it', () => {
        const session = sessionOf([bandMath()])
        session.watch(canonical('band-math-1'))
        session.settle(session.operations[0], failed(bandMath()))

        session.watch(canonical('band-math-1'))
        session.read(canonical('band-math-1'))

        expect(session.operations).toHaveLength(1)
    })

    it('is not loaded again because another question sharing its work is watched', () => {
        const session = sessionOf([changeAlerts()])
        session.watch(collectionMosaic('monitoring'))
        session.settle(session.operations[0], failed(changeAlerts()))

        session.watch(collectionMosaic('calibration'))

        expect(session.operations).toHaveLength(1)
    })

    it.each([
        ['on an explicit retry', session => session.registry.retryOutput(canonical('band-math-1'))],
        ['on a relevant edit', session => session.edit(edited(bandMath()))],
        ['on a credential change', session => session.replaceCredentials()],
        ['when watched again after every consumer left', (session, consumer) => {
            consumer.release()
            session.watch(canonical('band-math-1'))
        }]
    ])('is loaded again %s, once, and recovers', (_trigger, trigger) => {
        const session = sessionOf([bandMath()])
        const consumer = session.watch(canonical('band-math-1'))
        session.settle(session.operations[0], failed(bandMath()))

        trigger(session, consumer)
        session.settle(session.operations[1], described(session.catalogue()['band-math-1']))

        expect(session.operations).toHaveLength(2)
        expect(session.read(canonical('band-math-1')).status).toBe('READY')
    })

    it('includes an answer about other records than its key names, refused and recovered like any failure', () => {
        const session = sessionOf([bandMath()])
        session.watch(canonical('band-math-1'))

        session.settle(session.operations[0], described(bandMath(), {basis: basisOf(edited(bandMath()))}))
        session.watch(canonical('band-math-1'))

        expect(session.read(canonical('band-math-1'))).toMatchObject({
            status: 'UNAVAILABLE',
            error: expect.objectContaining({code: 'SOURCE_BASIS_CHANGED'})
        })
        expect(session.operations).toHaveLength(1)
        session.registry.retryOutput(canonical('band-math-1'))
        expect(session.operations).toHaveLength(2)
    })
})

describe('retention after the last consumer leaves', () => {
    it('answers a question reopened within the grace period at once, loading nothing', () => {
        const session = sessionOf([bandMath()])
        const consumer = session.watch(canonical('band-math-1'))
        session.settle(session.operations[0], described(bandMath()))
        consumer.release()

        session.advance(GRACE_MS - 1)
        const reopened = session.read(canonical('band-math-1'))
        session.watch(canonical('band-math-1'))

        expect(reopened.status).toBe('READY')
        expect(session.operations).toHaveLength(1)
    })

    it('withdraws the answer at the deadline, before its cleanup has run, and loads it again when reopened', () => {
        const session = sessionOf([bandMath()])
        const consumer = session.watch(canonical('band-math-1'))
        session.settle(session.operations[0], described(bandMath()))
        consumer.release()

        session.advance(GRACE_MS)
        const reopened = session.read(canonical('band-math-1'))
        session.watch(canonical('band-math-1'))

        expect(reopened.status).toBe('NEEDS_EVIDENCE')
        expect(session.operations).toHaveLength(2)
    })

    it('recomputes a reopened question from the session, never reusing an answer about an older record', () => {
        const session = sessionOf([bandMath()])
        const consumer = session.watch(canonical('band-math-1'))
        session.settle(session.operations[0], described(bandMath()))
        consumer.release()

        session.edit(edited(bandMath()))
        session.watch(canonical('band-math-1'))

        expect(session.operations).toHaveLength(2)
        expect(session.operations[1].recipe).toEqual(edited(bandMath()))
    })

    it('listens to nothing while no question is watched', () => {
        const session = sessionOf([bandMath()])
        const consumer = session.watch(canonical('band-math-1'))
        session.settle(session.operations[0], described(bandMath()))

        consumer.release()

        expect(session.listened()).toBe(false)
    })

    it('keeps no failure once every consumer has left', () => {
        const session = sessionOf([bandMath()])
        const consumer = session.watch(canonical('band-math-1'))
        session.settle(session.operations[0], failed(bandMath()))

        consumer.release()

        expect(session.read(canonical('band-math-1')).status).toBe('NEEDS_EVIDENCE')
    })

    it('keeps at most the configured number of unclaimed answers, evicting the earliest released', () => {
        const session = sessionOf(['a', 'b', 'c'].map(bandMath), {maxUnclaimed: 2})
        ;['a', 'b', 'c'].forEach(id => {
            const consumer = session.watch(canonical(id))
            session.settle(session.operations.at(-1), described(bandMath(id)))
            consumer.release()
            session.advance(1)
        })

        expect(['a', 'b', 'c'].map(id => session.read(canonical(id)).status)).toEqual(['NEEDS_EVIDENCE', 'READY', 'READY'])
    })

    it('never evicts an answer that is still watched', () => {
        const session = sessionOf([bandMath('a'), bandMath('b')], {maxUnclaimed: 0})
        session.watch(canonical('a'))
        session.settle(session.operations[0], described(bandMath('a')))
        const other = session.watch(canonical('b'))
        session.settle(session.operations[1], described(bandMath('b')))

        other.release()

        expect([session.read(canonical('a')).status, session.read(canonical('b')).status]).toEqual(['READY', 'NEEDS_EVIDENCE'])
    })
})

describe('the runtime scope ending', () => {
    it('stops every watch and its work, answers unavailable, and restarts nothing', () => {
        const session = sessionOf([bandMath()])
        const consumer = session.watch(canonical('band-math-1'))

        session.close()
        const reopened = session.watch(canonical('band-math-1'))

        expect([consumer.completed(), reopened.completed()]).toEqual([true, true])
        expect(session.operations).toHaveLength(1)
        expect(session.operations[0].torndown).toBe(true)
        expect(session.read(canonical('band-math-1'))).toMatchObject({
            status: 'UNAVAILABLE',
            error: expect.objectContaining({code: 'SOURCE_RUNTIME_UNAVAILABLE'})
        })
    })

    it('stops as well when an operation reports it first', () => {
        const session = sessionOf([bandMath()])
        const consumer = session.watch(canonical('band-math-1'))

        session.settle(session.operations[0], failed(bandMath(), 'SOURCE_RUNTIME_UNAVAILABLE'))
        session.registry.retryOutput(canonical('band-math-1'))

        expect(consumer.completed()).toBe(true)
        expect(session.operations).toHaveLength(1)
    })
})

const GRACE_MS = 60000

const canonical = recipeId => ({recipeId, product: {name: 'IMAGE_OUTPUT'}})

const collectionMosaic = period =>
    ({recipeId: 'change-alerts-1', product: {name: 'COLLECTION_MOSAIC', parameters: {period, mosaicType: 'latest'}}})

// Described from an observation of its running image, so the session alone never answers it.
const bandMath = (id = 'band-math-1') => ({
    id,
    type: 'BAND_MATH',
    model: {outputBands: {outputImages: [
        {imageId: 'i-1', outputBands: [{id: 'e', name: 'elevation', defaultOutputName: 'elevation'}]}
    ]}}
})

const edited = recipe => ({...recipe, model: {...recipe.model, edited: true}})

// Described from its configuration, over an asset nothing needs loaded to read.
const remappingOverAsset = () => ({
    id: 'remapping-1',
    type: 'REMAPPING',
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/landcover'}]},
        legend: {entries: [{value: 1, label: 'forest', color: '#000000'}]}
    }
})

// Its reference is not in the session, so its products need their dependencies completed and its output described.
const changeAlerts = () => ({
    id: 'change-alerts-1',
    type: 'CHANGE_ALERTS',
    model: {
        reference: {type: 'RECIPE_REF', id: 'ccdc-1'},
        date: {
            monitoringEnd: '2024-01-01', monitoringDuration: 2, monitoringDurationUnit: 'months',
            calibrationDuration: 3, calibrationDurationUnit: 'months'
        },
        sources: {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}},
        options: {corrections: ['SR']},
        changeAlertsOptions: {}
    }
})

const ccdc = () => ({id: 'ccdc-1', type: 'CCDC', model: {}})

const basisOf = recipe => [{id: recipe.id, content: recipeContent(recipe)}]

const described = (recipe, {basis = basisOf(recipe)} = {}) => ({
    status: 'READY',
    description: {output: {kind: 'IMAGE', bands: [{name: 'elevation', dataType: {arrayDimensions: 0}}]}},
    diagnostics: [],
    error: null,
    dependencyValidity: {status: 'VALID', diagnostics: []},
    basis
})

const failed = (recipe, code) => ({
    status: 'UNAVAILABLE',
    description: null,
    diagnostics: [],
    error: Object.assign(new Error('unavailable'), code ? {code} : {}),
    dependencyValidity: null,
    basis: basisOf(recipe)
})

// A session whose records, credentials, clock and runtime operations the test drives. A change is heard when the
// session says so; the `Unheard` variants change what the session holds without telling anyone yet.
const sessionOf = (records, {maxUnclaimed = 32} = {}) => {
    let catalogue = Object.fromEntries(records.map(recipe => [recipe.id, recipe]))
    let credentials = {}
    let closed = false
    let now = 0
    const changes = new Subject()
    const operations = []
    const timers = []
    const registry = new OutputRegistry({
        session: () => ({catalogue, credentials, closed}),
        sessionChanges$: changes,
        acquisitionOf: outputLoading,
        operationOf: ({kind, recipe}) => new Observable(subscriber => {
            const operation = {kind, recipe, subscriber, torndown: false}
            operations.push(operation)
            return () => operation.torndown = true
        }),
        isCompatible: compatibleBasis,
        retention: {graceMs: GRACE_MS, maxUnclaimed},
        clock: {
            now: () => now,
            setTimeout: (callback, ms) => {
                const timer = {at: now + ms, callback, cleared: false}
                timers.push(timer)
                return timer
            },
            clearTimeout: timer => timer.cleared = true
        }
    })
    return {
        registry,
        operations,
        catalogue: () => catalogue,
        watch: question => {
            let notified = 0
            let completed = false
            const subscription = registry.watchOutput$(question).subscribe({
                next: () => notified++,
                complete: () => completed = true
            })
            return {release: () => subscription.unsubscribe(), notified: () => notified, completed: () => completed}
        },
        // What a consumer reading this question renders from, as the session stands now.
        read: ({recipeId, product}) => {
            const recipe = catalogue[recipeId]
            const graph = buildMapDependencyGraph({recipe, loadedRecipes: catalogue})
            return readRecipeOutput({recipe, product, graph, heldFor: key => registry.heldFor(key)})
        },
        settle: ({subscriber}, terminal) => {
            subscriber.next(terminal)
            subscriber.complete()
        },
        editUnheard: recipe => catalogue = {...catalogue, [recipe.id]: recipe},
        edit: recipe => {
            catalogue = {...catalogue, [recipe.id]: recipe}
            changes.next()
        },
        replaceCredentialsUnheard: () => credentials = {},
        replaceCredentials: () => {
            credentials = {}
            changes.next()
        },
        hearChange: () => changes.next(),
        listened: () => changes.observed,
        // Time moves without any timer firing, as when a lookup comes before the cleanup callback.
        advance: ms => now += ms,
        close: () => {
            closed = true
            changes.complete()
        }
    }
}
