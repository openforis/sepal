import {of} from 'rxjs'

import {createImageOutputObserver} from '#sepal/recipe/output/observeImageOutput'
import {inheritedSchemaRole} from '#sepal/recipe/output/provider'
import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The bands an Asset recipe provides: the ones its own configured image holds, with the encoding its asset's
// metadata states. Persisted types, roles and composite names are literals.
//
// The two are not the same reading. A collection asset is read as its first image, while the recipe filters,
// masks and composites before anything is built from it - so a recipe filtered to a later image provides bands
// the asset reading never shows.

const ASSET_ID = 'users/x/stored'
const REFLECTANCE = {scale: 0.0000275, offset: -0.2, unit: '1'}
const THERMAL = {scale: 0.1, offset: 0, unit: 'K'}

// What reading the asset itself shows: its first image, and the encoding it states.
const ASSET_BANDS = [
    {name: 'red', dataType: {arrayDimensions: 0}, encoding: REFLECTANCE},
    {name: 'coefs', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'}
]

// What the configured recipe builds.
const CONFIGURED_BANDS = [
    {name: 'red', dataType: {arrayDimensions: 0}},
    {name: 'coefs', dataType: {arrayDimensions: 1}}
]

describe('an Asset recipe over an image', () => {
    it('provides the bands of its own configured image, with its asset\'s encoding and export policy', () => {
        const {description} = resolve(assetRecipe({type: 'Image'}))

        expect(description.executionReference).toEqual({type: 'RECIPE_REF', id: 'asset-recipe-1'})
        expect(description.output.bands).toEqual([
            {name: 'red', dataType: {arrayDimensions: 0}, encoding: REFLECTANCE},
            {name: 'coefs', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'}
        ])
    })

    it('describes nothing while its asset is unobserved', () => {
        const {description, diagnostics} = resolve(assetRecipe({type: 'Image'}), {asset: null})

        expect(description).toBeNull()
        expect(diagnostics.map(({code}) => code)).toEqual(['UNAVAILABLE_DESCRIPTION'])
    })

    it('describes nothing while its own image is unobserved', () => {
        const {description, diagnostics} = resolve(assetRecipe({type: 'Image'}), {configured: null})

        expect(description).toBeNull()
        expect(diagnostics.map(({code}) => code)).toEqual(['UNAVAILABLE_DESCRIPTION'])
    })
})

// A collection is read as its first image, which is not what a recipe filtered to a later one provides. The
// filtered collection is homogeneous; the asset it was read from need not be.
describe('an Asset recipe that filters its collection', () => {
    const filtered = () => assetRecipe({type: 'ImageCollection', composite: 'MOSAIC'})

    it('provides the band the filtered images hold, which reading the asset does not show', () => {
        const {description, diagnostics} = resolve(filtered(), {
            asset: [{name: 'red', dataType: {arrayDimensions: 0}, encoding: REFLECTANCE}],
            configured: [
                {name: 'red', dataType: {arrayDimensions: 0}},
                {name: 'nir', dataType: {arrayDimensions: 0}}
            ]
        })

        expect(diagnostics).toEqual([])
        expect(description.output.bands.map(({name}) => name)).toEqual(['red', 'nir'])
    })

    it('leaves a band its asset states no encoding for unknown', () => {
        const {description} = resolve(filtered(), {
            asset: [{name: 'red', dataType: {arrayDimensions: 0}, encoding: REFLECTANCE}],
            configured: [
                {name: 'red', dataType: {arrayDimensions: 0}},
                {name: 'nir', dataType: {arrayDimensions: 0}}
            ]
        })

        expect(description.output.bands).toEqual([
            {name: 'red', dataType: {arrayDimensions: 0}, encoding: REFLECTANCE},
            {name: 'nir', dataType: {arrayDimensions: 0}}
        ])
    })

    // The running image carries the properties of what it was built from, so an encoding read off it would state
    // the asset's values for bands the recipe may have changed. Encoding comes from the asset's metadata alone.
    it('takes no encoding from its own image, whatever that image carries', () => {
        const {description} = resolve(filtered(), {
            asset: [{name: 'red', dataType: {arrayDimensions: 0}, encoding: REFLECTANCE}],
            configured: [{name: 'red', dataType: {arrayDimensions: 0}, encoding: THERMAL}]
        })

        expect(description.output.bands).toEqual([
            {name: 'red', dataType: {arrayDimensions: 0}, encoding: REFLECTANCE}
        ])
    })
})

describe('an Asset recipe compositing a collection', () => {
    it.each([undefined, 'MOSAIC', 'MEDIAN', 'MEAN', 'MIN', 'MAX', 'MODE'])(
        'keeps the stored encoding for a %s composite, whose values are stored values or linear in them',
        composite => {
            const {description} = resolve(assetRecipe({type: 'ImageCollection', composite}))

            expect(description.output.bands).toEqual([
                {name: 'red', dataType: {arrayDimensions: 0}, encoding: REFLECTANCE},
                {name: 'coefs', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'}
            ])
        }
    )

    it('leaves the encoding of a standard deviation unknown, keeping its bands', () => {
        const {description} = resolve(assetRecipe({type: 'ImageCollection', composite: 'SD'}))

        expect(description.output.bands).toEqual([
            {name: 'red', dataType: {arrayDimensions: 0}},
            {name: 'coefs', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'}
        ])
    })
})

describe('what consumers may inherit through an Asset recipe', () => {
    it('declares no preservation, so no schema is inherited through it', () => {
        expect(inheritedSchemaRole(recipeType('ASSET_MOSAIC').imageOutput)).toBeUndefined()
    })

    it('is described through a Masking over it, with the composite\'s encoding', () => {
        const source = assetRecipe({type: 'ImageCollection', composite: 'SD'})
        const masking = {
            id: 'masked-1',
            type: 'MASKING',
            model: {imageToMask: {type: 'RECIPE_REF', id: source.id}}
        }

        const {description} = resolve(masking, {records: [source]})

        expect(description.executionReference).toEqual({type: 'RECIPE_REF', id: 'masked-1'})
        expect(description.output.bands[0]).toEqual({name: 'red', dataType: {arrayDimensions: 0}})
    })

    it('is described through a Masking over a filtered collection, with the bands the filter leaves', () => {
        const source = assetRecipe({type: 'ImageCollection', composite: 'MOSAIC'})
        const masking = {
            id: 'masked-1',
            type: 'MASKING',
            model: {imageToMask: {type: 'RECIPE_REF', id: source.id}}
        }

        const {description} = resolve(masking, {
            records: [source],
            asset: [{name: 'red', dataType: {arrayDimensions: 0}, encoding: REFLECTANCE}],
            configured: [
                {name: 'red', dataType: {arrayDimensions: 0}},
                {name: 'nir', dataType: {arrayDimensions: 0}}
            ]
        })

        expect(description.output.bands.map(({name}) => name)).toEqual(['red', 'nir'])
    })
})

// The observer discovers what to acquire in one pass, by resolving with nothing answered. A provider that
// returned before asking for its second reading would leave that reading undiscovered, and the request that
// followed would never be made.
describe('acquiring what an Asset recipe needs', () => {
    it('asks for its own image and for its asset in the one discovery pass, then resolves', () => {
        const requested = []
        const observer = createImageOutputObserver({
            observeBands$: ({reference}) => {
                requested.push(reference)
                return of(reference.type === 'ASSET'
                    ? [{name: 'red', arrayDimensions: 0, encoding: REFLECTANCE}]
                    : [{name: 'red', arrayDimensions: 0}, {name: 'nir', arrayDimensions: 0}])
            },
            declarationFor: ({type}) => recipeType(type)?.imageOutput
        })
        const states = []
        observer.state$.subscribe(state => states.push(state))

        observer.observe(graphOf(assetRecipe({type: 'ImageCollection', composite: 'MOSAIC'})))

        const published = states[states.length - 1]
        expect(requested).toHaveLength(2)
        expect(requested).toEqual(expect.arrayContaining([
            {type: 'RECIPE_REF', id: 'asset-recipe-1'},
            {type: 'ASSET', id: ASSET_ID}
        ]))
        expect(published.status).toBe('READY')
        expect(published.description.output.bands).toEqual([
            {name: 'red', dataType: {arrayDimensions: 0}, encoding: REFLECTANCE},
            {name: 'nir', dataType: {arrayDimensions: 0}}
        ])
    })
})

const assetRecipe = ({type, composite}) => ({
    id: 'asset-recipe-1',
    type: 'ASSET_MOSAIC',
    model: {
        assetDetails: {assetId: ASSET_ID, type},
        ...(composite === undefined ? {} : {composite: {type: composite}})
    }
})

const graphOf = (recipe, records = []) => buildRecipeDependencyGraph({
    rootRecipe: recipe,
    recipesById: new Map([recipe, ...records].map(record => [record.id, record]))
})

// The asset and the recipe's own image are read separately, and answer differently.
const resolve = (recipe, {records = [], asset = ASSET_BANDS, configured = CONFIGURED_BANDS} = {}) => resolveImageOutput({
    graph: graphOf(recipe, records),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    observationFor: ({type, id}) => {
        if (type === 'ASSET' && id === ASSET_ID) {
            return asset && {bands: asset, evidence: []}
        }
        if (type === 'RECIPE_REF' && id === 'asset-recipe-1') {
            return configured && {bands: configured}
        }
        return undefined
    }
})
