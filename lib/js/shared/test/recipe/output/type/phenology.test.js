import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// What a Phenology's image output is read as while its configuration is unfinished. Band names are literals.

describe('reading the image output of a Phenology whose configuration is unfinished', () => {
    it('describes every band, stating no encoding, while its model is empty', () => {
        const read = readOutput({id: 'phenology-1', type: 'PHENOLOGY', model: {}})

        assert.equal(read.status, 'READY')
        assert.deepEqual(read.description.output.bands.map(({name}) => name), BANDS)
        assert.ok(read.description.output.bands.every(band => band.encoding === undefined))
    })

    for (const [absence, recipe] of [['omitted', {id: 'phenology-1', type: 'PHENOLOGY'}], ['null', {id: 'phenology-1', type: 'PHENOLOGY', model: null}]]) {
        it(`reads a model that is ${absence} as an empty one`, () => {
            assert.deepEqual(readOutput(recipe), readOutput({...recipe, model: {}}))
        })
    }
})

const BANDS = [
    'background', 'amplitude', 'median',
    ...[1, 2, 3, 4].flatMap(segment => ['dayOfYear', 'days', 'median', 'slope', 'offset'].map(name => `${name}_${segment}`)),
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'
]

// The public read of a recipe held alone, its readiness judged.
const readOutput = recipe => readImageOutput({
    graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    readinessFor: ({type}) => recipeType(type)
})
