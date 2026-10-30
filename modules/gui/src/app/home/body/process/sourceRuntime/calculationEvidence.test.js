import _ from 'lodash'
import {Subject} from 'rxjs'
import {beforeEach, describe, expect, it} from 'vitest'

import {stratumFrameQuestion} from '#sepal/recipe/samplingDesign/stratumFrame'

import {observedListing} from '../recipeListing'
import {CalculationEvidence, DEFAULT_DEPENDENCY_EVIDENCE_POLICY} from './calculationEvidence'
import {SOURCE_BASIS_CHANGED} from './sourceRuntimeError'

// The calculations a design's panels ask for and the stratum frame's current evidence, as the source runtime keeps them:
// shared, reused only while nothing the session knows supersedes what they report, and published on the design for its
// requirements to read. The session, the clock and Earth Engine are substituted; the registry, the rules and the
// listing's merge of the revisions answers report are production's.

const FRAME = 'SAMPLING_STRATUM_FRAME'
// Opaque, as the Redux adapter's are: replaced credentials are another token equal to the first by value.
const CREDENTIALS = Object.freeze({})
const ASSET = {id: 'users/x/training', version: 't1'}

let session, changes, clock, requests, calculations, owner

beforeEach(() => {
    changes = new Subject()
    clock = fakeClock()
    requests = []
    calculations = []
    session = {
        catalogue: {'design-1': design()},
        listing: [{id: 'classification-1', revision: 1}],
        listingState: {}, tabs: [], saves: {}, assetEvidence: {}, sourceRefreshes: {},
        credentials: CREDENTIALS
    }
    owner = new CalculationEvidence({
        session: () => session,
        sessionChanges$: changes,
        write: ({recipeId, writes}) => {
            const recipe = _.cloneDeep(session.catalogue[recipeId])
            writes.forEach(({path, value}) => _.set(recipe, path, value))
            session = {...session, catalogue: {...session.catalogue, [recipeId]: recipe}}
            changes.next()
            return true
        },
        claimAssets: () => () => {},
        learnSources: ({recipes}) => {
            const {recipes: listing, listingState} = observedListing({recipes: session.listing, listingState: session.listingState}, recipes)
            if (listing !== session.listing || listingState !== session.listingState) {
                session = {...session, listing, listingState}
                changes.next()
            }
        },
        loadEvidence$: request => {
            const response$ = new Subject()
            requests.push({request, response$, credentials: session.credentials})
            return response$
        },
        clock
    })
})

describe('a calculation', () => {
    it('is asked once for consumers asking the same question', () => {
        const answers = []
        calculate().subscribe(answer => answers.push(answer))
        calculate().subscribe(answer => answers.push(answer))

        answer(0, frameEvidence({revision: 1}))

        expect(calculations).toHaveLength(1)
        expect(answers).toHaveLength(2)
    })

    it('is answered again once a recipe it read has a newer revision', () => {
        calculate().subscribe()
        answer(0, frameEvidence({revision: 1}))
        session = {...session, listing: [{id: 'classification-1', revision: 2}]}

        calculate().subscribe()

        expect(calculations).toHaveLength(2)
    })

    it('is reused while what it read is unchanged', () => {
        calculate().subscribe()
        answer(0, frameEvidence({revision: 1}))

        calculate().subscribe()

        expect(calculations).toHaveLength(1)
    })

    it.each([
        ['a recipe it read has a newer revision', () => ({listing: [{id: 'classification-1', revision: 2}]})],
        ['a recipe it read is no longer listed', () => ({listing: []})],
        ['a recipe it read is a draft whose save is pending', () => providerDraft({status: 'SAVING', revision: 1})],
        ['an asset it read was refreshed', () => ({sourceRefreshes: {assets: {[ASSET.id]: 1}}})],
        ['a recipe it read was refreshed', () => ({sourceRefreshes: {recipes: {'classification-1': 1}}})],
        ['the credentials changed', () => ({credentials: Object.freeze({})})]
    ])('fails, delivering and remembering nothing, when %s while it ran', (_name, change) => {
        const answers = []
        const errors = []
        calculate().subscribe({next: answer => answers.push(answer), error: error => errors.push(error)})
        session = {...session, ...change()}

        answer(0, frameEvidence({revision: 1, assets: [ASSET]}))

        expect(answers).toEqual([])
        expect(errors.map(({code}) => code)).toEqual([SOURCE_BASIS_CHANGED])
        expect(owner.dependencyEvidence({dependency: FRAME, question: frameEvidence({revision: 1}).question}).status).toBe(null)
    })

    it.each([
        ['listed', () => session.listing],
        ['not listed', () => []]
    ])('fails, replacing nothing, when it answers at an older revision of a recipe %s than one an answer since reported', (_name, listing) => {
        session = {...session, listing: listing()}
        const errors = []
        owner.watch$('design-1').subscribe()
        calculate().subscribe({error: error => errors.push(error)})
        requests[0].response$.next({...frameEvidence({revision: 2}), digest: 'newer'})

        answer(0, {...frameEvidence({revision: 1}), digest: 'older'})

        expect(errors.map(({code}) => code)).toEqual([SOURCE_BASIS_CHANGED])
        expect(published().evidence.digest).toBe('newer')
    })

    it('is delivered over an asset not yet checked, its evidence held back until the asset is', () => {
        const answers = []
        calculate().subscribe(answer => answers.push(answer))

        answer(0, frameEvidence({revision: 1, assets: [ASSET]}))

        expect(answers).toHaveLength(1)
        expect(owner.dependencyEvidence({dependency: FRAME, question: frameEvidence({revision: 1}).question}).status).toBe('PENDING')
        session = {...session, assetEvidence: {[ASSET.id]: checked(ASSET.version)}}
        expect(owner.dependencyEvidence({dependency: FRAME, question: frameEvidence({revision: 1}).question}).status).toBe('OBSERVED')
    })

    it('is asked again under replaced credentials, not joined to what the previous credentials asked', () => {
        calculate().subscribe({error: () => {}})
        session = {...session, credentials: Object.freeze({})}

        calculate().subscribe()

        expect(calculations).toHaveLength(2)
    })

    it('gives an editor the frame evidence it answered with, for the question it asked, while that is current', () => {
        const {question} = frameEvidence({revision: 1})
        calculate().subscribe()
        answer(0, frameEvidence({revision: 1}))

        expect(owner.dependencyEvidence({dependency: FRAME, question})).toMatchObject({status: 'OBSERVED', evidence: {digest: 'frame'}})

        session = {...session, listing: [{id: 'classification-1', revision: 2}]}

        expect(owner.dependencyEvidence({dependency: FRAME, question})).toEqual({status: null, evidence: null})
    })
})

describe('the stratum frame of an open design', () => {
    it('is read for the frame the design configures and published on it', () => {
        owner.watch$('design-1').subscribe()

        expect(requests.map(({request}) => request)).toEqual([{dependency: FRAME, question: stratumFrameQuestion(design().model)}])
        expect(published().status).toBe('PENDING')

        requests[0].response$.next(frameEvidence({revision: 1}))

        expect(published()).toMatchObject({status: 'OBSERVED', evidence: {digest: 'frame'}})
    })

    it('is read again once the listing knows a newer revision of what it read', () => {
        owner.watch$('design-1').subscribe()
        requests[0].response$.next(frameEvidence({revision: 1}))

        session = {...session, listing: [{id: 'classification-1', revision: 2}]}
        changes.next()

        expect(requests).toHaveLength(2)
        expect(published().status).toBe('PENDING')
    })

    it('is read again before Retrieve\'s authority lapses', () => {
        owner.watch$('design-1').subscribe()
        requests[0].response$.next(frameEvidence({revision: 1}))

        clock.advance(DEFAULT_DEPENDENCY_EVIDENCE_POLICY.maxAgeMs - DEFAULT_DEPENDENCY_EVIDENCE_POLICY.refreshBeforeMs)

        expect(requests).toHaveLength(2)
    })

    it('is taken from what a calculation just answered with, without another read', () => {
        calculate().subscribe()
        answer(0, frameEvidence({revision: 1}))

        owner.watch$('design-1').subscribe()

        expect(requests).toHaveLength(0)
        expect(published()).toMatchObject({status: 'OBSERVED', evidence: {digest: 'frame'}})
    })

    it('says a failed read failed, and reads again once its interval has passed', () => {
        owner.watch$('design-1').subscribe()
        requests[0].response$.error(new Error('Earth Engine unavailable'))

        expect(published().status).toBe('FAILED')
        clock.advance(DEFAULT_DEPENDENCY_EVIDENCE_POLICY.retryMs)

        expect(requests).toHaveLength(2)
    })

    it.each([
        ['credentials replaced', () => ({credentials: Object.freeze({})})],
        ['a recipe it read no longer listed', () => ({listing: []})]
    ])('is withdrawn and read again once the session has %s', (_name, change) => {
        owner.watch$('design-1').subscribe()
        requests[0].response$.next(frameEvidence({revision: 1}))

        session = {...session, ...change()}
        changes.next()

        expect(published().status).toBe('PENDING')
        expect(requests).toHaveLength(2)
    })

    it('is withdrawn and read again once a recipe it read is explicitly refreshed', () => {
        owner.watch$('design-1').subscribe()
        requests[0].response$.next(frameEvidence({revision: 1}))

        session = {...session, sourceRefreshes: {recipes: {'classification-1': 1}}}
        changes.next()

        expect(published().status).toBe('PENDING')
        expect(requests).toHaveLength(2)
    })

    it('is withdrawn while a known mutation of an asset it read is unsettled, though its token is unchanged', () => {
        session = {...session, assetEvidence: {[ASSET.id]: checked(ASSET.version)}}
        owner.watch$('design-1').subscribe()
        requests[0].response$.next(frameEvidence({revision: 1, assets: [ASSET]}))
        expect(published().status).toBe('OBSERVED')

        session = {...session, assetEvidence: {[ASSET.id]: {...checked(ASSET.version), stale: {at: 1, version: ASSET.version}}}}
        changes.next()

        expect(published().status).toBe('PENDING')
        expect(requests).toHaveLength(1)
    })

    it('is read again under replaced credentials when another design shared the read they asked', () => {
        session = {...session, catalogue: {...session.catalogue, 'design-2': {...design(), id: 'design-2'}}}
        owner.watch$('design-1').subscribe()
        owner.watch$('design-2').subscribe()
        const replaced = Object.freeze({})

        session = {...session, credentials: replaced}
        changes.next()

        expect(requests.map(({credentials}) => credentials)).toEqual([CREDENTIALS, replaced])
        requests[0].response$.next(frameEvidence({revision: 1}))
        expect(published().status).toBe('PENDING')
        expect(owner.dependencyEvidence({dependency: FRAME, question: published().question}).evidence).toBe(null)
    })

    it('is read again when an asset it read was refreshed while it was being read', () => {
        owner.watch$('design-1').subscribe()
        session = {...session, sourceRefreshes: {assets: {[ASSET.id]: 1}}}

        requests[0].response$.next(frameEvidence({revision: 1, assets: [ASSET]}))

        expect(requests).toHaveLength(2)
        expect(published().status).toBe('PENDING')
    })

    it('is withdrawn without reading storage while a recipe it read is a draft being saved, and read once the save lands', () => {
        owner.watch$('design-1').subscribe()
        requests[0].response$.next(frameEvidence({revision: 1}))

        session = {...session, ...providerDraft({status: 'SAVING', revision: 1})}
        changes.next()

        expect(published().status).toBe('PENDING')
        expect(owner.dependencyEvidence({dependency: FRAME, question: published().question})).toEqual({status: 'PENDING', evidence: null})
        expect(requests).toHaveLength(1)

        session = {...session, saves: {'classification-1': {status: 'SAVED', revision: 2, model: session.catalogue['classification-1'].model}}}
        changes.next()

        expect(requests).toHaveLength(2)
    })

    it('stays published while a refresh fails, and is read again only once the retry interval has passed', () => {
        const {maxAgeMs, refreshBeforeMs, retryMs} = DEFAULT_DEPENDENCY_EVIDENCE_POLICY
        owner.watch$('design-1').subscribe()
        requests[0].response$.next(frameEvidence({revision: 1}))
        clock.advance(maxAgeMs - refreshBeforeMs)

        requests[1].response$.error(new Error('Earth Engine unavailable'))
        clock.advance(retryMs - 1)

        expect(published()).toMatchObject({status: 'OBSERVED', evidence: {digest: 'frame'}})
        expect(requests).toHaveLength(2)
        clock.advance(1)
        expect(requests).toHaveLength(3)
    })

    it('is read once more when it answers with what the session already knows is superseded, and then fails', () => {
        owner.watch$('design-1').subscribe()
        session = {...session, listing: [{id: 'classification-1', revision: 2}]}

        requests[0].response$.next(frameEvidence({revision: 1}))
        requests[1].response$.next(frameEvidence({revision: 1}))

        expect(requests).toHaveLength(2)
        expect(published().status).toBe('FAILED')
    })

    it('is no longer read once the design is closed', () => {
        owner.watch$('design-1').subscribe().unsubscribe()
        session = {...session, listing: [{id: 'classification-1', revision: 2}]}
        changes.next()

        expect(requests).toHaveLength(1)
    })
})

describe('a question an editor asks of the frame', () => {
    it('is read again after a revision leaving it meaning the same, so what was calculated for it stays established', () => {
        const question = {...stratumFrameQuestion(design().model), crs: 'EPSG:32631'}
        owner.watchQuestion$({dependency: FRAME, question}).subscribe()
        requests[0].response$.next({...frameEvidence({revision: 1}), question, digest: 'edited'})

        session = {...session, listing: [{id: 'classification-1', revision: 2}]}
        changes.next()
        expect(owner.dependencyEvidence({dependency: FRAME, question}).status).toBe('PENDING')
        requests[1].response$.next({...frameEvidence({revision: 2}), question, digest: 'edited'})

        expect(requests.map(({request}) => request.question)).toEqual([question, question])
        expect(owner.dependencyEvidence({dependency: FRAME, question})).toMatchObject({status: 'OBSERVED', evidence: {digest: 'edited'}})
    })

    it('tells the editor what it is told whenever that changes, and is no longer read once it stops asking', () => {
        const question = {...stratumFrameQuestion(design().model), crs: 'EPSG:32631'}
        const told = []
        const watch = owner.watchQuestion$({dependency: FRAME, question}).subscribe(entry => told.push(entry.status))
        requests[0].response$.next({...frameEvidence({revision: 1}), question})

        watch.unsubscribe()
        session = {...session, listing: [{id: 'classification-1', revision: 2}]}
        changes.next()

        expect(told).toEqual(['PENDING', 'OBSERVED'])
        expect(requests).toHaveLength(1)
    })
})

const design = () => ({
    id: 'design-1',
    type: 'SAMPLING_DESIGN',
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]},
        stratification: {type: 'RECIPE', recipeId: 'classification-1', band: 'class', crs: 'EPSG:6933', scale: 30}
    }
})

const frameEvidence = ({revision, assets = []}) => ({
    dependency: FRAME,
    contractVersion: 1,
    question: stratumFrameQuestion(design().model),
    digest: 'frame',
    provenance: {recipes: [{id: 'classification-1', revision}], assets},
    unversioned: []
})

const calculate = () => owner.calculate$({
    kind: 'SAMPLING_STRATUM_AREAS',
    question: {band: 'class'},
    request$: () => {
        const response$ = new Subject()
        calculations.push(response$)
        return response$
    },
    evidenceOf: ({calculatedFrom}) => [calculatedFrom.dependencies[FRAME]]
})

const answer = (index, evidence) => {
    calculations[index].next({groups: [{stratum: 1, area: 100}], calculatedFrom: {dependencies: {[FRAME]: evidence}}})
    calculations[index].complete()
}

const published = () => session.catalogue['design-1'].ui?.dependencyEvidence?.[FRAME]

// An asset's evidence as the session holds it once checked, at this token.
const checked = version => ({version, unversioned: false, checkedAt: 0, changedAt: null, failure: null})

// The classification the frame reads, open with an edit storage does not hold yet.
const providerDraft = saveState => ({
    catalogue: {...session.catalogue, 'classification-1': {id: 'classification-1', type: 'CLASSIFICATION', revision: 1, model: {edited: true}}},
    tabs: [{id: 'classification-1'}],
    saves: {'classification-1': saveState}
})

const fakeClock = () => {
    let now = 0
    let timers = []
    return {
        now: () => now,
        setTimeout: (callback, ms) => {
            const timer = {at: now + ms, callback}
            timers.push(timer)
            return timer
        },
        clearTimeout: timer => {
            timers = timers.filter(other => other !== timer)
        },
        advance: ms => {
            now += ms
            const due = timers.filter(({at}) => at <= now)
            timers = timers.filter(timer => !due.includes(timer))
            due.forEach(({callback}) => callback())
        }
    }
}
