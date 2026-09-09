import {
    INHERITED,
    inheritedSchemaSource,
    NOT_INHERITED,
    UNRESOLVED_ROLE
} from '#sepal/recipe/output/inheritedSchemaSource'

// Which source describes a recipe's current schema, asked of the real registry. Persisted types are literals
// so a production rename cannot make this pass.

const masking = ({primary, mask} = {}) => ({
    id: 'masked-1',
    type: 'MASKING',
    model: {imageToMask: primary, imageMask: mask}
})

const recipeSelection = id => ({type: 'RECIPE_REF', id})
const assetSelection = id => ({type: 'ASSET', id})

describe('the source a recipe inherits its schema from', () => {
    it('is the primary image of a masking recipe, not its mask', () => {
        const source = inheritedSchemaSource(masking({
            primary: recipeSelection('ccdc-1'),
            mask: recipeSelection('forest-mask')
        }))

        expect(source).toEqual({
            status: INHERITED,
            role: 'PRIMARY_IMAGE',
            reference: {type: 'RECIPE_REF', id: 'ccdc-1'},
            path: ['model', 'imageToMask']
        })
    })

    it('points at the model field holding that selection', () => {
        expect(inheritedSchemaSource(masking({primary: recipeSelection('ccdc-1')})).path)
            .toEqual(['model', 'imageToMask'])
    })

    it('is an asset when the primary image is one', () => {
        const source = inheritedSchemaSource(masking({primary: assetSelection('users/bob/segments')}))

        expect(source.reference).toEqual({type: 'ASSET', id: 'users/bob/segments'})
    })

    it('is the inner wrapper when one masking recipe masks another', () => {
        const source = inheritedSchemaSource(masking({primary: recipeSelection('masked-inner')}))

        expect(source.reference).toEqual({type: 'RECIPE_REF', id: 'masked-inner'})
    })
})

describe('a recipe that inherits nothing', () => {
    // CCDC's bands are a property of its running image, so nothing else describes them.
    it('includes one whose output is intrinsic', () => {
        expect(inheritedSchemaSource({id: 'ccdc-1', type: 'CCDC', model: {}}).status).toBe(NOT_INHERITED)
    })

    it('includes one that declares no image output at all', () => {
        expect(inheritedSchemaSource({id: 'stack-1', type: 'STACK', model: {}}).status).toBe(NOT_INHERITED)
    })

    it('includes an unknown persisted type', () => {
        expect(inheritedSchemaSource({id: 'x', type: 'NOT_A_TYPE', model: {}}).status).toBe(NOT_INHERITED)
    })

    it('reports no reference and no field to inherit from', () => {
        expect(inheritedSchemaSource({id: 'ccdc-1', type: 'CCDC', model: {}}).reference).toBeNull()
        expect(inheritedSchemaSource({id: 'ccdc-1', type: 'CCDC', model: {}}).path).toBeNull()
    })
})

// An unfilled role is not an answer of "no source": the recipe cannot be resolved either, and naming one of
// the other edges would be a guess about which input describes the output.
describe('a declared role its model does not fill exactly once', () => {
    it('is unresolved when the primary image has not been selected', () => {
        expect(inheritedSchemaSource(masking({mask: recipeSelection('forest-mask')})).status)
            .toBe(UNRESOLVED_ROLE)
    })

    it('carries the role it could not resolve, and no reference', () => {
        const source = inheritedSchemaSource(masking())

        expect(source.role).toBe('PRIMARY_IMAGE')
        expect(source.reference).toBeNull()
    })
})
