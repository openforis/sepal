import {describe, expect, it, vi} from 'vitest'

// What a CCDC recipe says about the segments image it produces. The band vocabulary itself belongs to
// `~/sources`; what is asserted here is what CCDC promises on top of it, and that a Classification arrives
// as a record rather than being read from CCDC's own model.

vi.mock('~/sources', () => ({
    getAvailableBands: ({dataSets, classification}) => [
        ...(dataSets.includes('SENTINEL_1') ? ['VV', 'VH'] : ['ndvi']),
        ...(classification?.classifierType ? ['regression'] : [])
    ]
}))

vi.mock('./ccdcRecipe', () => ({
    getAllVisualizations: recipe => recipe.model.templates || []
}))

const {describeSegments, describeSegments$, FITTED_MEASURES} = await import('./segmentDescription')

const ccdc = ({dataSets = {LANDSAT: ['LANDSAT_8']}, templates, dateFormat = 1} = {}) => ({
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        dates: {startDate: '2015-01-01', endDate: '2021-01-01'},
        sources: {dataSets},
        options: {corrections: []},
        ccdcOptions: {dateFormat},
        templates
    }
})

describe('the segments image a CCDC recipe describes', () => {
    it('carries one coefficient array, one rmse and one magnitude per fitted band, then the timing bands', () => {
        expect(describeSegments(ccdc()).bands).toEqual([
            'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude',
            'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'
        ])
    })

    // Every fitted band carries the same measures: what the coefficient array stands for, plus rmse and
    // magnitude. Advertising a measure the image will not carry would be a promise it cannot keep.
    it('advertises exactly the measures the image will carry', () => {
        expect(describeSegments(ccdc()).baseBands).toEqual([{name: 'ndvi', measures: FITTED_MEASURES}])
        expect(FITTED_MEASURES).toEqual([
            'value', 'intercept', 'slope',
            'phase_1', 'amplitude_1', 'phase_2', 'amplitude_2', 'phase_3', 'amplitude_3',
            'rmse', 'magnitude'
        ])
    })

    it('says how its dates are represented and what period it fitted', () => {
        expect(describeSegments(ccdc({dateFormat: 0}))).toEqual(expect.objectContaining({
            dateFormat: 0,
            startDate: '2015-01-01',
            endDate: '2021-01-01'
        }))
    })

    it('carries its presentation templates as they are', () => {
        const templates = [{id: 't', bands: ['ndvi'], type: 'continuous'}]

        expect(describeSegments(ccdc({templates})).visualizations).toBe(templates)
    })

    it('follows the data set it fits', () => {
        expect(describeSegments(ccdc({dataSets: {SENTINEL_1: ['SENTINEL_1']}})).baseBands.map(({name}) => name))
            .toEqual(['VV', 'VH'])
    })
})

// The Classification a CCDC recipe classifies by is one of its declared dependencies. It arrives resolved,
// as a record; nothing here reads it off CCDC's model or loads it.
describe('a CCDC recipe that classifies by another recipe', () => {
    const classification = {
        id: 'classification-1',
        type: 'CLASSIFICATION',
        model: {classifier: {type: 'RANDOM_FOREST'}, legend: {entries: [{value: 1}]}}
    }

    it('fits the classification bands as well', () => {
        expect(describeSegments(ccdc(), {classification}).baseBands.map(({name}) => name))
            .toEqual(['ndvi', 'regression'])
    })

    it('fits only its own bands when the classification is not supplied', () => {
        expect(describeSegments(ccdc()).baseBands.map(({name}) => name)).toEqual(['ndvi'])
    })
})

// The provider a reader of segments dispatches to. CCDC finds the Classification it fits through the edge
// it declares, so nothing outside reads its model to locate it.
describe('the provider CCDC registers', () => {
    const classification = {
        id: 'classification-1',
        type: 'CLASSIFICATION',
        model: {classifier: {type: 'RANDOM_FOREST'}, legend: {entries: [{value: 1}]}}
    }
    const graph = {
        edges: [
            {sourceRecipeId: 'ccdc-1', role: 'CLASSIFICATION_SOURCE', reference: {type: 'RECIPE_REF', id: 'classification-1'}},
            {sourceRecipeId: 'ccdc-1', role: 'SOURCE_IMAGERY', reference: {type: 'ASSET', id: 'users/x/imagery'}}
        ]
    }
    const describe$ = ({edges}) => {
        let described
        describeSegments$({
            recipe: ccdc(),
            graph: {edges},
            recipesById: new Map([['classification-1', classification]])
        }).subscribe(result => described = result)
        return described
    }

    it('fits the classification the recipe declares an edge to', () => {
        expect(describe$(graph).baseBands.map(({name}) => name)).toEqual(['ndvi', 'regression'])
    })

    it('fits only its own bands when it declares no classification', () => {
        expect(describe$({edges: [graph.edges[1]]}).baseBands.map(({name}) => name)).toEqual(['ndvi'])
    })

    it('ignores an edge of another role', () => {
        const imageryOnly = {edges: [{...graph.edges[0], role: 'SOURCE_IMAGERY'}]}

        expect(describe$(imageryOnly).baseBands.map(({name}) => name)).toEqual(['ndvi'])
    })
})
