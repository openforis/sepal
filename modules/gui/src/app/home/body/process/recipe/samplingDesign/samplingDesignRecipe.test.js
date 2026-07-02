import {normalizeSavedLayers, toTaskRecipe} from './samplingDesignRecipe'

const recipe = {
    id: 'r1',
    type: 'SAMPLING_DESIGN',
    title: 'Design',
    model: {
        stratification: {strata: [{value: 1, label: 'Forest', color: '#0a0', area: 300, weight: 0.3}]},
        proportions: {anticipatedProportions: [{stratum: 1, proportion: 0.48}]},
        sampleAllocation: {
            allocationStrategy: 'PROPORTIONAL',
            allocation: [{stratum: 1, label: 'Forest', color: '#0a0', area: 300, weight: 0.3, proportion: 0.48, sampleSize: 30}]
        }
    }
}

describe('toTaskRecipe', () => {
    it('replaces sampleAllocation.allocation with the canonical task rows', () => {
        const taskRecipe = toTaskRecipe(recipe)
        expect(taskRecipe.model.sampleAllocation.allocation).toEqual([
            {stratum: 1, sampleSize: 30, area: 300, color: '#0a0', label: 'Forest', weight: 0.3, proportion: 0.48}
        ])
    })

    it('preserves the other sampleAllocation settings', () => {
        expect(toTaskRecipe(recipe).model.sampleAllocation.allocationStrategy).toBe('PROPORTIONAL')
    })

    it('preserves the rest of the recipe and model untouched', () => {
        const taskRecipe = toTaskRecipe(recipe)
        expect(taskRecipe.id).toBe('r1')
        expect(taskRecipe.model.stratification).toBe(recipe.model.stratification)
        expect(taskRecipe.model.proportions).toBe(recipe.model.proportions)
    })

    it('does not mutate the input recipe', () => {
        const before = recipe.model.sampleAllocation.allocation
        toTaskRecipe(recipe)
        expect(recipe.model.sampleAllocation.allocation).toBe(before)
    })
})

describe('normalizeSavedLayers', () => {
    it('passes through when there are no saved areas', () => {
        expect(normalizeSavedLayers(undefined)).toBeUndefined()
        expect(normalizeSavedLayers({mode: 'grid'})).toEqual({mode: 'grid'})
    })

    it('remaps a this-recipe area image layer to Google Satellite', () => {
        const savedLayers = {
            mode: 'grid',
            areas: {center: {id: 'a', imageLayer: {sourceId: 'this-recipe'}, featureLayers: [{sourceId: 'aoi'}]}}
        }
        const normalized = normalizeSavedLayers(savedLayers)
        expect(normalized.areas.center.imageLayer.sourceId).toBe('google-satellite')
        expect(normalized.areas.center.featureLayers).toEqual([{sourceId: 'aoi'}])
        expect(normalized.mode).toBe('grid')
    })

    it('remaps this-recipe across all areas in split mode and preserves others', () => {
        const savedLayers = {
            mode: 'stack',
            areas: {
                left: {imageLayer: {sourceId: 'this-recipe'}},
                right: {imageLayer: {sourceId: 'google-satellite'}}
            }
        }
        const normalized = normalizeSavedLayers(savedLayers)
        expect(normalized.areas.left.imageLayer.sourceId).toBe('google-satellite')
        expect(normalized.areas.right.imageLayer.sourceId).toBe('google-satellite')
    })

    it('does not mutate the input', () => {
        const savedLayers = {areas: {center: {imageLayer: {sourceId: 'this-recipe'}}}}
        normalizeSavedLayers(savedLayers)
        expect(savedLayers.areas.center.imageLayer.sourceId).toBe('this-recipe')
    })

    it('removes stale samplingDesignSamples feature layer entries', () => {
        const savedLayers = {
            areas: {center: {imageLayer: {sourceId: 'google-satellite'}, featureLayers: [{sourceId: 'aoi'}, {sourceId: 'samplingDesignSamples'}]}}
        }
        const normalized = normalizeSavedLayers(savedLayers)
        expect(normalized.areas.center.featureLayers).toEqual([{sourceId: 'aoi'}])
    })
})
