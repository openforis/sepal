import {describe, expect, it, vi} from 'vitest'

// The layout's image sources for the images a recipe reads, derived from its declared inputs, beside the sources saved
// with its layout - shown here for Masking, whose saved recipe carried an entry for every image ever selected, and for
// Sampling Design, whose proportions image is shown but never depended on.

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: masking} = await import('../recipe/masking/masking')
const {default: samplingDesign} = await import('../recipe/samplingDesign/samplingDesign')
const {assembleImageLayerSources, layoutImageLayerSources} = await import('./dependencyLayerSources')

addRecipeType(masking())
addRecipeType(samplingDesign())

const OPTICAL = 'dc63258d-cbcd-49d2-a0eb-1f07b4a4c645'
const MASK = '6fb90cab-f491-492e-8829-39d775b5a0c2'
const LEFTOVERS = ['4fc87e9b-e305-47b2-9663-c368cb18b08d', '85d36dc8-47f5-4555-8979-4574389f56a1', 'f4c19176-aade-4f1f-bc4f-68d95ce2eaa9']
const LISTING = [{id: OPTICAL, name: 'optical'}, {id: MASK, name: 'mask'}]

describe('a recipe\'s layer sources', () => {
    it('are one derived source per image it reads, its saved entries for images it no longer reads hidden', () => {
        const manual = {id: 'layer-1', type: 'Recipe', sourceConfig: {recipeId: LEFTOVERS[0], description: 'bayts_historical'}}
        const recipe = maskedOptical({additional: [...savedEntries([OPTICAL, MASK, ...LEFTOVERS]), manual]})

        const {dependencySources, additionalImageLayerSources, legacySourceIds} = assembleImageLayerSources(recipe, LISTING)

        expect(dependencySources).toEqual([recipeSource(OPTICAL, 'optical'), recipeSource(MASK, 'mask')])
        expect(additionalImageLayerSources).toEqual([manual])
        expect(legacySourceIds).toEqual([])
    })

    it('are one source for an image both masked and masking', () => {
        const recipe = maskedOptical({imageMask: OPTICAL})

        expect(assembleImageLayerSources(recipe, LISTING).dependencySources).toEqual([recipeSource(OPTICAL, 'optical')])
    })

    it('keep a saved entry for an image no longer read while a map area shows it, as it was saved', () => {
        const recipe = maskedOptical({additional: savedEntries([LEFTOVERS[0]]), areas: {left: area(LEFTOVERS[0])}})

        const {additionalImageLayerSources, legacySourceIds} = assembleImageLayerSources(recipe, LISTING)

        expect(additionalImageLayerSources).toEqual(savedEntries([LEFTOVERS[0]]))
        expect(legacySourceIds).toEqual([LEFTOVERS[0]])
    })

    it('name a recipe by its listing title, else as its saved entry named it, else by its id', () => {
        const recipe = maskedOptical({additional: savedEntries([MASK])})

        expect(assembleImageLayerSources(recipe, []).dependencySources).toEqual([
            recipeSource(OPTICAL, OPTICAL),
            recipeSource(MASK, `saved ${MASK}`)
        ])
    })

    it('include a sampling design\'s proportions image beside its stratification, but not its AOI table', () => {
        const recipe = {
            id: 'design-1', type: 'SAMPLING_DESIGN',
            model: {
                aoi: {type: 'EE_TABLE', id: 'users/x/countries', keyColumn: 'id', key: 'SDN'},
                stratification: {type: 'RECIPE', recipeId: OPTICAL},
                proportions: {type: 'ASSET', assetId: 'projects/p/assets/probability', recipeId: 'stale'}
            }
        }

        expect(assembleImageLayerSources(recipe, LISTING).dependencySources.map(({id, type}) => [type, id]))
            .toEqual([['Recipe', OPTICAL], ['Asset', 'projects/p/assets/probability']])
    })
})

describe('a layout write', () => {
    it('saves a derived source an area is given, and drops saved entries no area shows', () => {
        const manual = {id: 'layer-1', type: 'Asset', sourceConfig: {asset: 'users/x/image'}}
        const recipe = maskedOptical({additional: [...savedEntries(LEFTOVERS), manual]})

        const saved = layoutImageLayerSources({recipe, areas: {center: area(MASK)}, recipeListing: LISTING})

        expect(saved).toEqual([manual, recipeSource(MASK, 'mask')])
    })
})

// Masking's saved recipe, as `.vscode/masked_optical 2.json` holds it: its image to mask and mask, each saved as an entry
// by the input editor of the time, with its area showing the recipe itself.
const maskedOptical = ({imageMask = MASK, additional = [], areas = {center: area('this-recipe')}} = {}) => ({
    id: 'masking-1',
    type: 'MASKING',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: OPTICAL},
        imageMask: {type: 'RECIPE_REF', id: imageMask}
    },
    layers: {
        areas,
        mode: 'grid',
        additionalImageLayerSources: additional
    }
})

const savedEntries = ids => ids.map(id => recipeSource(id, `saved ${id}`))

const recipeSource = (recipeId, description) => ({id: recipeId, type: 'Recipe', sourceConfig: {recipeId, description}})

const area = sourceId => ({id: `area-${sourceId}`, imageLayer: {sourceId}, featureLayers: []})
