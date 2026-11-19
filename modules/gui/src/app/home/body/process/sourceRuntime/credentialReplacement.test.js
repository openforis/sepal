import {describe, expect, it} from 'vitest'

import {assetEvidenceOfState} from './assetEvidence'
import {earthEngineGeneration} from './credentialId'
import {evidenceSession, outdatedBasis, startingBasis} from './sourceEvidenceBasis'

// The Google credentials in effect, by identity, are the epoch of what is read from Earth Engine: once the credential
// container is replaced - another account, a refresh, a revocation - asset evidence and evidence bases read under the
// previous one no longer stand, while a session keeping the same container keeps them.

describe('asset evidence', () => {
    it('is held while the same credentials are in effect', () => {
        const state = recorded(signedIn({}))

        expect(assetEvidenceOfState(reloadedUser(state))).toBe(ASSETS)
    })

    it('is dropped once the credentials are replaced, even by equal ones, or removed', () => {
        const credentials = {projectId: 'some-project'}
        const state = recorded(signedIn(credentials))

        expect(assetEvidenceOfState(withCredentials(state, {...credentials}))).toEqual({})
        expect(assetEvidenceOfState(withCredentials(state, undefined))).toEqual({})
    })
})

describe('an evidence basis', () => {
    it('is outdated by credentials replaced since it was read, and not by the same ones', () => {
        const state = recorded(signedIn({projectId: 'some-project'}))
        const basis = startingBasis({reference: REFERENCE, recipe: RECIPE, session: evidenceSession(state)})

        expect(outdatedBasis(basis, {recipe: RECIPE, sourceKey: basis.key, session: evidenceSession(reloadedUser(state))})).toBe(false)
        expect(outdatedBasis(basis, {recipe: RECIPE, sourceKey: basis.key, session: evidenceSession(withCredentials(state, {projectId: 'some-project'}))})).toBe(true)
    })
})

const ASSET_ID = 'users/x/image'
const ASSETS = Object.freeze({[ASSET_ID]: {version: 'v1', checkedAt: 1, changedAt: null, failure: null}})
const REFERENCE = {type: 'ASSET', id: ASSET_ID}
const RECIPE = {id: 'masking-1', type: 'MASKING', model: {imageToMask: REFERENCE, imageMask: {type: 'ASSET', id: 'users/x/mask'}}}

const signedIn = credentials => ({
    user: {currentUser: {username: 'someone', googleTokens: credentials}},
    process: {loadedRecipes: {[RECIPE.id]: RECIPE}, recipes: [], tabs: [], saveStates: {}}
})

// Asset evidence as the source runtime records it: for the credentials in effect as it was read.
const recorded = state => ({
    ...state,
    process: {...state.process, assetEvidence: {generation: earthEngineGeneration(state), assets: ASSETS}}
})

// The user record read again, its credential container unchanged.
const reloadedUser = state => ({...state, user: {currentUser: {...state.user.currentUser}}})

const withCredentials = (state, credentials) =>
    ({...state, user: {currentUser: {...state.user.currentUser, googleTokens: credentials}}})
