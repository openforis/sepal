import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// A Sampling Design draws samples; it produces no image. Through the registered declarations and the real read, it
// is refused as an image wherever it is read as one. Codes are literals.

describe('a Sampling Design read as an image', () => {
    it('is refused as having no image output', () => {
        expect(read([design()])).toEqual({
            status: 'INVALID',
            description: null,
            diagnostics: [{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['design-1']}],
            needs: {records: [], observations: []}
        })
    })

    it('is refused through a Masking and a Stack that read it, located at the design', () => {
        const masking = {id: 'masking-1', type: 'MASKING', model: {imageToMask: {type: 'RECIPE_REF', id: 'design-1'}}}
        const stack = {
            id: 'stack-1',
            type: 'STACK',
            model: {
                inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: 'design-1'}]},
                bandNames: {bandNames: [{imageId: 'i-1', bands: [{originalName: 'class', outputName: 'class'}]}]}
            }
        }

        expect(read([masking, design()]).diagnostics).toEqual([{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['masking-1', 'design-1']}])
        expect(read([stack, design()]).diagnostics).toEqual([{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['stack-1', 'design-1']}])
    })
})

const design = () => ({
    id: 'design-1',
    type: 'SAMPLING_DESIGN',
    model: {
        aoi: {type: 'RECIPE', id: 'aoi-1'},
        stratification: {type: 'ASSET', assetId: 'users/x/strata', recipeId: 'abandoned-1'}
    }
})

const read = ([root, ...others]) => readImageOutput({
    graph: buildRecipeDependencyGraph({
        rootRecipe: root,
        recipesById: new Map([root, ...others].map(recipe => [recipe.id, recipe]))
    }),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    observationFor: () => undefined
})
