import {defineRecipeType} from '#sepal/recipe/defineRecipeType'
import {isCanonicalDescription, mapProduct} from '#sepal/recipe/output/product'
import {imageOutputProvider} from '#sepal/recipe/output/provider'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'

// Named map products through the real resolver, over synthetic types. Diagnostic codes are literals, as in the
// resolver's own suite, so a rename cannot pass unnoticed.

describe('a recipe type declaring map products', () => {
    const typeWith = mapProducts => () => defineRecipeType({type: 'SYNTHETIC', directSources: () => [], mapProducts})

    it('keeps them by name', () => {
        const count = mapProduct({describe: () => ({bands: [], evidence: []})})

        expect(typeWith({COUNT: count})().mapProducts).toEqual({COUNT: count})
    })

    it.each([
        ['a list', [mapProduct({describe: () => ({})})]],
        ['a product without describe', {COUNT: {}}],
        ['its canonical output as a product', {IMAGE_OUTPUT: mapProduct({describe: () => ({})})}],
        ['a blank name', {' ': mapProduct({describe: () => ({})})}]
    ])('is refused for %s', (_case, mapProducts) => {
        expect(typeWith(mapProducts)).toThrow()
    })

    // Parameters are not supported yet, so a product claiming them cannot pass for one that takes none.
    it('is refused for a product declaring anything but describe', () => {
        expect(() => mapProduct({describe: () => ({}), parameters: () => ({})})).toThrow(/parameters/)
    })
})

describe('reading a named product', () => {
    it('describes the root as that product, identified by the name asked for', () => {
        const {status, description} = read({product: {name: 'COUNT'}})

        expect(status).toBe('READY')
        expect(description).toEqual({
            executionReference: {type: 'RECIPE_REF', id: 'root'},
            output: {kind: 'IMAGE', bands: [{name: 'count', dataType: {arrayDimensions: 0}}], product: {name: 'COUNT'}},
            evidence: []
        })
    })

    it('leaves the canonical description as it was when no product is asked for', () => {
        expect(read().description.output).toEqual({kind: 'IMAGE', bands: [{name: 'segments', dataType: {arrayDimensions: 1}}]})
    })

    it('keeps the identity it was asked for, whatever the provider says of itself', () => {
        const {description} = read({product: {name: 'SELF_NAMING'}})

        expect(description.output.product).toEqual({name: 'SELF_NAMING'})
    })

    it('validates the bands a product describes as any description', () => {
        expect(read({product: {name: 'MALFORMED'}})).toMatchObject({
            status: 'INVALID',
            diagnostics: [expect.objectContaining({code: 'DUPLICATE_BAND_NAME', product: 'MALFORMED'})]
        })
    })

    it('is refused for a product the type does not declare', () => {
        expect(read({product: {name: 'SEGMENTS'}})).toMatchObject({
            status: 'INVALID',
            diagnostics: [expect.objectContaining({code: 'UNDECLARED_PRODUCT', product: 'SEGMENTS'})]
        })
    })

    it.each([
        ['a parameter it does not take', {year: 2020}],
        ['parameters that are not an object', 'COUNT']
    ])('is refused with %s', (_case, parameters) => {
        expect(read({product: {name: 'COUNT', parameters}})).toMatchObject({
            status: 'INVALID',
            diagnostics: [expect.objectContaining({code: 'INVALID_PRODUCT_PARAMETERS'})]
        })
    })

    it('takes no parameters as none', () => {
        expect(read({product: {name: 'COUNT', parameters: {}}}).status).toBe('READY')
    })

    // A product is answered from its configuration while only its dependencies are acquired; one that read
    // evidence would be answered without it.
    it.each(['observation', 'input', 'inputs'])('is refused when its provider reads its %s', read_ => {
        expect(read({product: {name: `READS_${read_.toUpperCase()}`}})).toMatchObject({
            status: 'INVALID',
            description: null,
            diagnostics: [expect.objectContaining({code: 'UNSUPPORTED_PRODUCT_READ', read: read_})]
        })
    })

    it('is not described when its recipe\'s own model cannot be read', () => {
        const unreadable = {code: 'MALFORMED_SOURCE', path: ['model', 'sources']}

        expect(read({product: {name: 'COUNT'}, recipeDiagnostics: new Map([['root', [unreadable]]])})).toMatchObject({
            status: 'INVALID',
            diagnostics: [unreadable]
        })
    })
})

describe('whether a description may decide an export', () => {
    it('holds for a canonical description, and not for one naming a product', () => {
        const canonical = read().description
        const count = read({product: {name: 'COUNT'}}).description

        expect(isCanonicalDescription(canonical)).toBe(true)
        expect(isCanonicalDescription(count)).toBe(false)
    })
})

const scalar = name => ({name, dataType: {arrayDimensions: 0}})

const products = {
    COUNT: mapProduct({describe: () => ({bands: [scalar('count')], evidence: []})}),
    SELF_NAMING: mapProduct({describe: () => ({bands: [scalar('count')], evidence: [], output: {product: {name: 'OTHER'}}, product: {name: 'OTHER'}})}),
    MALFORMED: mapProduct({describe: () => ({bands: [scalar('count'), scalar('count')], evidence: []})}),
    READS_OBSERVATION: mapProduct({describe: ({observation}) => observation()}),
    READS_INPUT: mapProduct({describe: ({input}) => input()}),
    READS_INPUTS: mapProduct({describe: ({inputs}) => inputs()})
}

const canonical = imageOutputProvider({
    describe: () => ({bands: [{name: 'segments', dataType: {arrayDimensions: 1}}], evidence: []})
})

const read = ({product, recipeDiagnostics = new Map()} = {}) => readImageOutput({
    graph: {recipes: [{id: 'root', type: 'SYNTHETIC', model: {}}], edges: [], diagnostics: [], recipeDiagnostics},
    declarationFor: () => canonical,
    observationFor: () => undefined,
    product,
    productFor: (_recipe, name) => products[name]
})
