import {directSourceEdges} from '#sepal/recipe/source/directSources'

import {auditDirectSources} from '../audit.js'

// LandTrendr's source contract, fixture and all. One file per recipe type: the central suites verify the
// framework, and what a given type declares belongs with that type.
//
// PROVENANCE. Reconstructed from the production writers, not recorded from a saved recipe:
//   model.dates, model.sources, model.options   recipe/landTrendr/landTrendrRecipe.js defaultModel
//   model.sources                               recipe/landTrendr/panels/sources/sources.jsx valuesToModel
//   model.aoi                                   recipe/mosaic/panels/aoi/aoiModel.js valuesToModel
//
// The sources panel writes only `dataSets`, `cloudPercentageThreshold` and `index`, and offers optical data
// sets alone. `classification` and `assets` are parameters here rather than defaults because no current
// writer emits either; they are what an older or programmatically written model can carry, and the point of
// the cases below is what execution then does with it - a classification always, assets only on Planet.

const recipeAoi = () => ({type: 'RECIPE', id: 'aoi-recipe-1'})
const polygonAoi = () => ({type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]})

const LANDSAT = {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}
const PLANET = {PLANET: ['BASEMAPS']}

const landTrendrRecipe = ({aoi = recipeAoi(), dataSets = LANDSAT, classification, assets} = {}) => ({
    id: 'landtrendr-1',
    type: 'LANDTRENDR',
    model: {
        aoi,
        dates: {startYear: 2000, endYear: 2023},
        sources: {
            cloudPercentageThreshold: 75,
            dataSets,
            index: 'nbr',
            ...(classification ? {classification} : {}),
            ...(assets ? {assets} : {})
        },
        options: {corrections: ['SR'], cloudBuffer: 0},
        landTrendrOptions: {maxSegments: 6, spikeThreshold: 0.9}
    }
})

const edges = recipe => directSourceEdges(recipe).edges

describe('LANDTRENDR', () => {
    // No imageFactory call of its own: the AOI arrives through toGeometry$ and the sources through
    // getCollection$. A guard that enumerated factory call sites would report this recipe as depending on
    // nothing at all.
    it('declares its AOI', () => {
        expect(edges(landTrendrRecipe())).toEqual([
            {reference: {type: 'RECIPE_REF', id: 'aoi-recipe-1'}, role: 'AOI', path: ['model', 'aoi']}
        ])
    })

    // Catalogue identifiers and a band name, not references. A definition reading `dataSets` as assets would
    // emit LANDSAT_9 as a dependency.
    it('emits no edge for catalogue data sets or the index band', () => {
        expect(directSourceEdges(landTrendrRecipe({aoi: polygonAoi()})))
            .toEqual({edges: [], diagnostics: []})
    })

    // collection.js resolves the classification BEFORE choosing a branch, so it is a dependency of every
    // source type, not only Planet.
    it('declares an optional Classification carried in its sources', () => {
        const recipe = landTrendrRecipe({aoi: polygonAoi(), classification: 'classification-1'})
        expect(edges(recipe)).toEqual([
            {reference: {type: 'RECIPE_REF', id: 'classification-1'}, role: 'CLASSIFICATION_SOURCE', path: ['model', 'sources', 'classification']}
        ])
    })

    // Planet data sets, because only the Planet branch of collection.js reads `sources.assets`. Asserting
    // this against a LANDSAT model would claim a dependency execution never resolves.
    it('declares Planet source assets in model order', () => {
        const recipe = landTrendrRecipe({
            aoi: polygonAoi(),
            dataSets: PLANET,
            assets: ['projects/p/assets/basemaps-a', 'projects/p/assets/basemaps-b']
        })
        expect(edges(recipe)).toEqual([
            {reference: {type: 'ASSET', id: 'projects/p/assets/basemaps-a'}, role: 'SOURCE_IMAGERY', path: ['model', 'sources', 'assets', 0]},
            {reference: {type: 'ASSET', id: 'projects/p/assets/basemaps-b'}, role: 'SOURCE_IMAGERY', path: ['model', 'sources', 'assets', 1]}
        ])
    })

    // The other half, and the one that matters: collection.js picks radar, then optical, then Planet as the
    // fallback, and ONLY the Planet branch reads `sources.assets`. LandTrendr's panel offers optical data
    // sets alone, so a recipe carrying an asset list at all got it from an older or programmatic model - and
    // while its data sets select Optical, that list is dead configuration. Emitting it would pin a source
    // this recipe cannot read.
    it('emits no edge for assets an optical model still carries', () => {
        const recipe = landTrendrRecipe({
            aoi: polygonAoi(),
            dataSets: LANDSAT,
            assets: ['projects/p/assets/basemaps-a']
        })
        expect(directSourceEdges(recipe)).toEqual({edges: [], diagnostics: []})
    })

    it('declares the AOI, Classification and Planet assets in contract order', () => {
        const recipe = landTrendrRecipe({
            dataSets: PLANET,
            classification: 'classification-1',
            assets: ['projects/p/assets/basemaps-a']
        })
        expect(edges(recipe).map(({role}) => role))
            .toEqual(['AOI', 'CLASSIFICATION_SOURCE', 'SOURCE_IMAGERY'])
    })

    it.each([
        ['the writer default', landTrendrRecipe()],
        ['a Planet model carrying collection sources', landTrendrRecipe({
            dataSets: PLANET, classification: 'classification-1', assets: ['projects/p/assets/basemaps-a']
        })]
    ])('declares every reference in %s', (_name, recipe) => {
        expect(auditDirectSources(recipe).diagnostics).toEqual([])
    })
})
