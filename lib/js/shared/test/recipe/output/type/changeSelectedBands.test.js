import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// Class Change and Index Change are described once both images are, and refused where one names a band its image's
// current description does not provide - located at the field naming it. What could not be described establishes
// nothing. Codes, statuses and persisted field names are literals.

describe.each(['CLASS_CHANGE', 'INDEX_CHANGE'])('a %s recipe', type => {
    it('is refused at the band an image names that its source lacks', () => {
        const result = read(recipeOf(type), {[FROM]: ['other'], [TO]: ['band']})

        expect(result.status).toBe('INVALID')
        expect(result.diagnostics).toEqual([{code: 'MISSING_INPUT_BAND', path: ['model', 'fromImage', 'band'], recipePath: ['change-1']}])
    })

    it('is described once both images provide the bands they name', () => {
        const result = read(recipeOf(type), {[FROM]: ['band'], [TO]: ['band']})

        expect(result.status).toBe('READY')
    })

    it('needs an image not yet described, finding nothing missing meanwhile', () => {
        const result = read(recipeOf(type), {[TO]: ['band']})

        expect(result.status).toBe('NEEDS_EVIDENCE')
        expect(result.diagnostics.map(({code}) => code)).toEqual(['UNAVAILABLE_DESCRIPTION'])
    })

    it('is described from a recipe image\'s configuration, observing nothing of it', () => {
        const recipe = recipeOf(type, {fromImage: {type: 'RECIPE_REF', id: MOSAIC.id, band: 'red'}})

        const result = read(recipe, {[TO]: ['band']}, [MOSAIC])

        expect(result.status).toBe('READY')
    })
})

describe('an INDEX_CHANGE recipe', () => {
    it('is refused at an error band its image\'s source lacks', () => {
        const recipe = recipeOf('INDEX_CHANGE', {toImage: {type: 'ASSET', id: TO, band: 'band', errorBand: 'rmse'}})

        const result = read(recipe, {[FROM]: ['band'], [TO]: ['band']})

        expect(result.diagnostics).toEqual([{code: 'MISSING_INPUT_BAND', path: ['model', 'toImage', 'errorBand'], recipePath: ['change-1']}])
    })

    it('is described with an error band its image\'s source provides', () => {
        const recipe = recipeOf('INDEX_CHANGE', {toImage: {type: 'ASSET', id: TO, band: 'band', errorBand: 'rmse'}})

        const result = read(recipe, {[FROM]: ['band'], [TO]: ['band', 'rmse']})

        expect(result.status).toBe('READY')
    })
})

const FROM = 'users/x/from'
const TO = 'users/x/to'

// An optical mosaic, described from its configuration.
const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}

const recipeOf = (type, model = {}) => ({
    id: 'change-1',
    type,
    model: {
        fromImage: {type: 'ASSET', id: FROM, band: 'band'},
        toImage: {type: 'ASSET', id: TO, band: 'band'},
        legend: {entries: []},
        ...model
    }
})

const declarationFor = ({type}) => recipeType(type)?.imageOutput

// What can be said from the recipes held and the bands held for each input asset.
const read = (recipe, bandsByAsset, records = []) => readImageOutput({
    graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([recipe, ...records].map(record => [record.id, record]))}),
    declarationFor,
    observationFor: ({type, id}) => type === 'ASSET' && bandsByAsset[id]
        ? {bands: bandsByAsset[id].map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []}
        : undefined
})
