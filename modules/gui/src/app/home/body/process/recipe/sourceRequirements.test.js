import {describe, expect, it, vi} from 'vitest'

import {CCDC_SEGMENTS} from '#sepal/recipe/capability/ccdcSegments'

// Whether a selection's requirement can be answered from its evidence owner: which selection the owner's observation
// answers, and which asset must authorize it. Change Alerts' composed tests cover the rest through its declaration.

const declarations = vi.hoisted(() => ({current: []}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: () => ({sourceRequirements: declarations.current})}))

const {CHECKED, readSourceRequirements, SUPPORTED, UNAVAILABLE, UNCHECKED} = await import('./sourceRequirements')
const {declaredSelections, OBSERVED} = await import('./sourceEvidence')
const {earthEngineGeneration} = await import('./sourceEvidenceBasis')

describe('a requirement of a selected source', () => {
    it('is not answered by an observation of another source the recipe selects', () => {
        declarations.current = [requirementOn('PRIMARY_IMAGE'), requirementOn('MASK_IMAGE')]

        const [primary, mask] = read()

        expect(primary).toMatchObject({acquisition: CHECKED, verdict: {status: SUPPORTED}})
        expect(mask.acquisition).toBe(UNCHECKED)
    })

    it('is authorized by the asset that establishes it, whatever another asset the recipe reads is doing', () => {
        declarations.current = [requirementOn('PRIMARY_IMAGE')]

        const [established] = read({[SEGMENTS]: current(), [MASK]: failing()})
        const [notEstablished] = read({[SEGMENTS]: failing(), [MASK]: current()})

        expect(established.verdict.status).toBe(SUPPORTED)
        expect(notEstablished).toMatchObject({acquisition: UNAVAILABLE, assetId: SEGMENTS})
    })
})

const SEGMENTS = 'users/x/segments'
const MASK = 'users/x/mask'
const NOW = 1000000

// A capability that is established by the selected asset itself, and an evaluation that accepts what was observed.
const requirementOn = role => ({
    role,
    section: {id: role, label: role},
    requirement: {
        capability: {capability: CCDC_SEGMENTS, evidenceAsset: ({assetId}) => assetId, factsOf: observed => observed.segments},
        evaluate: facts => facts ? {status: SUPPORTED} : {status: 'NEEDS_EVIDENCE'}
    }
})

const current = () => ({version: 'v1', checkedAt: NOW, changedAt: null, failure: null, checking: null, expired: false, stale: null})
const failing = () => ({...current(), failure: {kind: 'TRANSIENT', code: 'UNAVAILABLE', at: NOW}})

// A Masking whose evidence owner observes the image it masks, and has published that observation.
const read = (assets = {[SEGMENTS]: current(), [MASK]: current()}) => {
    const credentials = {}
    const recipe = {
        id: 'masking-1',
        type: 'MASKING',
        model: {imageToMask: {type: 'ASSET', id: SEGMENTS}, imageMask: {type: 'ASSET', id: MASK}},
        ui: {sourceEvidence: {sourceKey: `ASSET:${SEGMENTS}`, status: OBSERVED, segments: {}, observationId: 'o1'}}
    }
    const state = {
        user: {currentUser: {googleTokens: credentials}},
        process: {loadedRecipes: {[recipe.id]: recipe}, recipes: [], tabs: [], saveStates: {}}
    }
    state.process.assetEvidence = {generation: earthEngineGeneration(state), assets}
    const owner = {
        observationId: 'o1',
        basis: {
            key: `ASSET:${SEGMENTS}`,
            selections: declaredSelections(recipe),
            earthEngineGeneration: earthEngineGeneration(state),
            refreshed: 0,
            dependencies: []
        },
        observes: true,
        records: 'COMPLETE'
    }
    return readSourceRequirements({state, recipe, evidenceOwnerOf: () => owner, now: NOW})
}
