import {describe, expect, it, vi} from 'vitest'

import {heldSourceStatusOfState, sectionStatusOf, sourceProblemsOfState} from './selectedSourceStatus'
import {CHECKED, CHECKING, SUPPORTED, UNSUPPORTED} from './sourceRequirements'

// Whether a section's status advises of other sections' settings no longer suiting its source, over reads of one
// selection as the requirement reader makes them (sourceRequirements.js).

vi.mock('~/translate', () => ({msg: key => key}))
// A type requiring something of its own configuration that no recipe of it meets.
const unmetConfiguration = vi.hoisted(() => ({
    id: 'CALCULATIONS_COMPLETE',
    section: {id: 'calculations', label: 'calculations'},
    requirement: {
        id: 'CALCULATIONS_COMPLETE',
        evaluate: () => ({status: 'UNSUPPORTED', diagnostic: {code: 'INCOMPLETE'}}),
        describe: () => ({message: 'calculations are incomplete', details: []})
    },
    localFacts: () => ({}),
    operations: []
}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: type => type === 'CONFIGURED' ? {sourceRequirements: [unmetConfiguration]} : undefined
}))

describe('a section whose source suits it, while another section\'s setting does not', () => {
    it('advises of that section where the requirement names it to', () => {
        const reads = [met(requirementIn('reference')), unmet(requirementIn('sources', {advise: ['reference']}))]

        expect(sectionStatusOf(STATE, reads, 'reference').advisories).toHaveLength(1)
    })

    it('says nothing of it where no requirement names the section to advise, though both read one source', () => {
        const reads = [met(requirementIn('reference')), unmet(requirementIn('sources')), unmet(requirementIn('dates', {advise: ['options']}))]

        expect(sectionStatusOf(STATE, reads, 'reference')).toBe(null)
    })
})

describe('the problems of a recipe\'s sections', () => {
    it('are said, and said again, while the session holds no recipe listing', () => {
        const state = {process: {loadedRecipes: {'recipe-1': {id: 'recipe-1', type: 'CONFIGURED', model: {}}}}}

        const problems = sourceProblemsOfState(state, 'recipe-1')

        expect(problems).toEqual({calculations: 'calculations are incomplete'})
        expect(sourceProblemsOfState(state, 'recipe-1')).toBe(problems)
    })
})

describe('the status of a source holding an operation back', () => {
    it('names the recipe as the listing names it, and by its new name once the listing renames it', () => {
        const listed = name => ({process: {recipes: [{id: RECIPE.id, name}]}})

        expect(heldSourceStatusOfState(listed('Forest change'), RECIPE, CHECKING_GATE).recipe).toBe('Forest change')
        expect(heldSourceStatusOfState(listed('Forest loss'), RECIPE, CHECKING_GATE).recipe).toBe('Forest loss')
    })

    it('reads an unchanged listing once, whatever else in the state changed', () => {
        const {listing, passes} = passesOver([{id: RECIPE.id, name: 'Forest change'}])

        heldSourceStatusOfState({process: {recipes: listing}, stream: {load: 'ACTIVE'}}, RECIPE, CHECKING_GATE)
        const status = heldSourceStatusOfState({process: {recipes: listing}, stream: {load: 'COMPLETED'}}, RECIPE, CHECKING_GATE)

        expect(status.recipe).toBe('Forest change')
        expect(passes).toHaveLength(1)
    })

    it('names the recipe by its own title while the session holds no listing', () => {
        expect(heldSourceStatusOfState({process: {}}, RECIPE, CHECKING_GATE).recipe).toBe('Untitled change')
        expect(heldSourceStatusOfState({process: {}}, RECIPE, CHECKING_GATE).recipe).toBe('Untitled change')
    })
})

const STATE = {}
const SELECTED = {type: 'ASSET', id: 'users/x/segments'}

const requirementIn = (section, declaration = {}) => ({
    role: 'PRIMARY_IMAGE',
    section: {id: section, label: section},
    requirement: {capability: {label: 'segments'}, describe: () => ({message: `${section} does not suit`, details: []})},
    ...declaration
})

const met = declaration =>
    ({declaration, selected: SELECTED, selects: declaration.section.id === 'reference', acquisition: CHECKED, verdict: {status: SUPPORTED}})

const unmet = declaration =>
    ({...met(declaration), verdict: {status: UNSUPPORTED, diagnostic: {code: 'NOT_SUITED'}}})

const RECIPE = {id: 'recipe-1', title: 'Untitled change'}

const CHECKING_GATE = {
    section: 'reference',
    read: {...met(requirementIn('reference')), acquisition: CHECKING, verdict: {status: 'NEEDS_EVIDENCE'}}
}

// A listing that records each whole pass made over it.
const passesOver = entries => {
    const passes = []
    const listing = new Proxy(entries, {
        get: (target, key, receiver) => {
            ['map', 'find', 'filter', 'forEach', 'reduce'].includes(key) && passes.push(key)
            return Reflect.get(target, key, receiver)
        }
    })
    return {listing, passes}
}
