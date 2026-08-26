import {describe, expect, it} from 'vitest'

import {filterRecipeTypes, IGNORE, nextTagFilter, noFilters, recipeTypeTags} from './createRecipeFilter'

// Mirrors the real registry: shared tags, multiple tags, and recipe types
// declaring no tags at all (bandMath, classification, remapping, ...).
const OPTICAL_MOSAIC = {id: 'MOSAIC', labels: {name: 'Optical mosaic', creationDescription: 'Multiple scenes into one'}, tags: ['MOSAIC']}
const RADAR_MOSAIC = {id: 'RADAR_MOSAIC', labels: {name: 'Radar mosaic', creationDescription: 'Multiple scenes into one'}, tags: ['MOSAIC']}
const CHANGE_ALERTS = {id: 'CHANGE_ALERTS', labels: {name: 'Change alerts', creationDescription: 'Detect changes over time'}, tags: ['CHANGE', 'ALERTS']}
const CLASSIFICATION = {id: 'CLASSIFICATION', labels: {name: 'Classification', creationDescription: 'Classify imagery'}}

const recipeTypes = [OPTICAL_MOSAIC, RADAR_MOSAIC, CHANGE_ALERTS, CLASSIFICATION]

const ids = result => result.map(({id}) => id)

describe('filterRecipeTypes', () => {
    it('matches a recipe type by any one of its tags', () => {
        expect(ids(filterRecipeTypes({recipeTypes, tagFilter: 'CHANGE'}))).toEqual(['CHANGE_ALERTS'])
        expect(ids(filterRecipeTypes({recipeTypes, tagFilter: 'ALERTS'}))).toEqual(['CHANGE_ALERTS'])
    })

    it('returns every recipe type, tagged or not, when no tag is selected', () => {
        expect(ids(filterRecipeTypes({recipeTypes, tagFilter: IGNORE}))).toEqual(['MOSAIC', 'RADAR_MOSAIC', 'CHANGE_ALERTS', 'CLASSIFICATION'])
    })

    it('excludes recipe types declaring no tags when a tag is selected', () => {
        expect(ids(filterRecipeTypes({recipeTypes, tagFilter: 'MOSAIC'}))).toEqual(['MOSAIC', 'RADAR_MOSAIC'])
    })

    it('matches recipe types on both name and creation description', () => {
        expect(ids(filterRecipeTypes({recipeTypes, tagFilter: IGNORE, textFilterValues: ['mosaic']}))).toEqual(['MOSAIC', 'RADAR_MOSAIC'])
        expect(ids(filterRecipeTypes({recipeTypes, tagFilter: IGNORE, textFilterValues: ['scenes']}))).toEqual(['MOSAIC', 'RADAR_MOSAIC'])
    })

    it('requires every search term to match', () => {
        expect(ids(filterRecipeTypes({recipeTypes, tagFilter: IGNORE, textFilterValues: ['radar', 'mosaic']}))).toEqual(['RADAR_MOSAIC'])
        expect(ids(filterRecipeTypes({recipeTypes, tagFilter: IGNORE, textFilterValues: ['radar', 'change']}))).toEqual([])
    })

    it('requires a match on the text filter and the tag filter alike', () => {
        expect(ids(filterRecipeTypes({recipeTypes, tagFilter: 'CHANGE', textFilterValues: ['alerts']}))).toEqual(['CHANGE_ALERTS'])
        expect(ids(filterRecipeTypes({recipeTypes, tagFilter: 'MOSAIC', textFilterValues: ['alerts']}))).toEqual([])
    })
})

describe('recipeTypeTags', () => {
    it('lists each distinct tag once, in registry order, ignoring untagged recipe types', () => {
        expect(recipeTypeTags(recipeTypes)).toEqual(['MOSAIC', 'CHANGE', 'ALERTS'])
    })
})

describe('nextTagFilter', () => {
    it('replaces the selected tag rather than adding to it', () => {
        expect(nextTagFilter('CHANGE', 'MOSAIC')).toBe('CHANGE')
    })

    it('clears back to no filter when the selected tag is picked again', () => {
        expect(nextTagFilter('CHANGE', 'CHANGE')).toBe(IGNORE)
    })

    it('stays unfiltered when the "All" chip is picked again', () => {
        expect(nextTagFilter(IGNORE, IGNORE)).toBe(IGNORE)
    })
})

describe('noFilters', () => {
    it('is a state the filter treats as showing everything', () => {
        expect(ids(filterRecipeTypes({recipeTypes, ...noFilters()}))).toEqual(['MOSAIC', 'RADAR_MOSAIC', 'CHANGE_ALERTS', 'CLASSIFICATION'])
    })

    it('hands out a fresh text filter array each time, so resets cannot alias', () => {
        expect(noFilters().textFilterValues).not.toBe(noFilters().textFilterValues)
    })
})
