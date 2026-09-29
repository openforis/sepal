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

    it.each([
        ['anything but describe, parameters and delegatesTo', {observes: 'RUNNING_IMAGE'}, /observes/],
        ['parameters that are not a function', {parameters: {year: 2020}}, /parameters/],
        ['a blank delegate', {delegatesTo: ' '}, /delegates/],
        ['an empty list of delegates', {delegatesTo: []}, /delegates/],
        ['a delegate listed twice', {delegatesTo: ['MOSAIC', 'MOSAIC']}, /delegates/],
        ['a blank delegate among others', {delegatesTo: ['MOSAIC', ' ']}, /delegates/],
        ['a delegate that is no type name', {delegatesTo: ['MOSAIC', 42]}, /delegates/]
    ])('is refused for a product declaring %s', (_case, declared, reason) => {
        expect(() => mapProduct({describe: () => ({}), ...declared})).toThrow(reason)
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

    it('is refused where its provider refuses, located at the product', () => {
        expect(read({product: {name: 'REFUSING'}})).toEqual({
            status: 'INVALID',
            description: null,
            diagnostics: [{code: 'SYNTHETIC_CONFLICT', path: [], recipePath: ['root'], product: 'REFUSING'}],
            needs: {records: [], observations: []}
        })
    })

    it('keeps its provider\'s refusal beside a read it was refused', () => {
        expect(read({product: {name: 'REFUSING_AFTER_READING'}}).diagnostics).toEqual([
            {code: 'UNSUPPORTED_PRODUCT_READ', path: [], read: 'observation', recipePath: ['root'], product: 'REFUSING_AFTER_READING'},
            {code: 'SYNTHETIC_CONFLICT', path: [], recipePath: ['root'], product: 'REFUSING_AFTER_READING'}
        ])
    })

    it('is malformed where its provider states bands beside a refusal', () => {
        expect(read({product: {name: 'REFUSING_WITH_BANDS'}}).diagnostics).toEqual([
            {code: 'MALFORMED_IMAGE_OUTPUT', path: ['diagnostics'], recipePath: ['root'], product: 'REFUSING_WITH_BANDS'}
        ])
    })

    it('is refused for a product the type does not declare', () => {
        expect(read({product: {name: 'SEGMENTS'}})).toMatchObject({
            status: 'INVALID',
            diagnostics: [expect.objectContaining({code: 'UNDECLARED_PRODUCT', product: 'SEGMENTS'})]
        })
    })

    it.each([
        ['a parameter it does not take', {year: 2020}, ['parameters', 'year']],
        ['parameters that are not an object', 'COUNT', ['parameters']],
        ['null parameters', null, ['parameters']]
    ])('is refused with %s', (_case, parameters, path) => {
        expect(read({product: {name: 'COUNT', parameters}})).toMatchObject({
            status: 'INVALID',
            diagnostics: [expect.objectContaining({code: 'INVALID_PRODUCT_PARAMETERS', path, product: 'COUNT'})]
        })
    })

    it.each([
        ['no parameters', {}],
        ['parameters given only as undefined', {year: undefined}]
    ])('takes %s as none', (_case, parameters) => {
        expect(read({product: {name: 'COUNT', parameters}}).status).toBe('READY')
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

describe('reading a product that takes parameters', () => {
    it('is described with the parameters its declaration normalizes, and identified by them', () => {
        const {status, description} = read({product: {name: 'DATED', parameters: {}}})

        expect(status).toBe('READY')
        expect(description.output.bands).toEqual([scalar('y2000')])
        expect(description.output.product).toEqual({name: 'DATED', parameters: {year: 2000}})
    })

    it('omits a parameter given as undefined, as the wire does', () => {
        expect(read({product: {name: 'DATED', parameters: {year: undefined}}}).description.output.product)
            .toEqual({name: 'DATED', parameters: {year: 2000}})
    })

    it('is refused where its declaration refuses, each refusal located under its parameters', () => {
        expect(read({product: {name: 'DATED', parameters: {year: '2020', month: 6}}})).toMatchObject({
            status: 'INVALID',
            description: null,
            diagnostics: [
                expect.objectContaining({code: 'INVALID_PRODUCT_PARAMETERS', path: ['parameters', 'year'], recipePath: ['root'], product: 'DATED'}),
                expect.objectContaining({code: 'INVALID_PRODUCT_PARAMETERS', path: ['parameters', 'month'], recipePath: ['root'], product: 'DATED'})
            ]
        })
    })

    it('never reaches its provider with parameters it refused', () => {
        const described = []
        const product = mapProduct({
            parameters: () => ({diagnostics: [{path: ['year']}]}),
            describe: ({parameters}) => described.push(parameters)
        })

        read({product: {name: 'REFUSING'}, productsByName: {REFUSING: product}})

        expect(described).toEqual([])
    })
})

describe('reading a product that delegates', () => {
    it('is described by its delegate\'s declaration of the recipe it builds, under its own recipe\'s reference', () => {
        const {status, description} = read({product: {name: 'DELEGATING', parameters: {year: 2021}}})

        expect(status).toBe('READY')
        expect(description).toEqual({
            executionReference: {type: 'RECIPE_REF', id: 'root'},
            output: {
                kind: 'IMAGE',
                bands: [scalar('mosaic_2021')],
                product: {name: 'DELEGATING', parameters: {year: 2021}}
            },
            evidence: []
        })
    })

    it('validates the bands its delegate describes as its own', () => {
        expect(read({product: {name: 'DELEGATING_TO_MALFORMED'}})).toMatchObject({
            status: 'INVALID',
            diagnostics: [expect.objectContaining({code: 'DUPLICATE_BAND_NAME', recipePath: ['root'], product: 'DELEGATING_TO_MALFORMED'})]
        })
    })

    it.each([
        ['a recipe of a type other than the one it declares', 'DELEGATING_ELSEWHERE', 'OTHER'],
        ['a type that declares no output', 'DELEGATING_TO_UNDECLARED', 'UNDECLARED'],
        ['a type whose output reads its role', 'DELEGATING_TO_ROLE', 'ROLE_READING'],
        ['a recipe while declaring no delegate', 'UNDECLARED_DELEGATION', 'MOSAIC']
    ])('is refused when it delegates to %s', (_case, name, delegate) => {
        expect(read({product: {name}})).toMatchObject({
            status: 'INVALID',
            description: null,
            diagnostics: [expect.objectContaining({code: 'UNSUPPORTED_DELEGATE', delegate, recipePath: ['root'], product: name})]
        })
    })

    // A product may name several types it delegates to, and delegates to whichever its recipe calls for.
    it.each([
        ['MOSAIC', 'mosaic_2021'],
        ['OTHER', 'other']
    ])('is described by the declaration of the listed type %s its recipe is built as', (type, band) => {
        expect(read({product: {name: 'DELEGATING_TO_EITHER', parameters: {type}}}).description.output.bands).toEqual([scalar(band)])
    })

    it('is refused when it delegates to a type it does not list', () => {
        expect(read({product: {name: 'DELEGATING_TO_EITHER', parameters: {type: 'MALFORMED_MOSAIC'}}}).diagnostics)
            .toEqual([expect.objectContaining({code: 'UNSUPPORTED_DELEGATE', delegate: 'MALFORMED_MOSAIC', product: 'DELEGATING_TO_EITHER'})])
    })

    it('keeps its delegate\'s refusal beside a read its delegate was refused', () => {
        expect(read({product: {name: 'DELEGATING_TO_REFUSING_AFTER_READING'}}).diagnostics).toEqual([
            {code: 'UNSUPPORTED_PRODUCT_READ', path: [], read: 'observation', delegate: 'REFUSING_AFTER_READING', recipePath: ['root'], product: 'DELEGATING_TO_REFUSING_AFTER_READING'},
            {code: 'SYNTHETIC_CONFLICT', path: ['model'], delegate: 'REFUSING_AFTER_READING', recipePath: ['root'], product: 'DELEGATING_TO_REFUSING_AFTER_READING'}
        ])
    })

    it('is refused where its delegate refuses the recipe it builds, located at the product and its delegate', () => {
        expect(read({product: {name: 'DELEGATING_TO_REFUSING'}})).toEqual({
            status: 'INVALID',
            description: null,
            diagnostics: [{code: 'SYNTHETIC_CONFLICT', path: ['model'], delegate: 'REFUSING', recipePath: ['root'], product: 'DELEGATING_TO_REFUSING'}],
            needs: {records: [], observations: []}
        })
    })

    // Its delegate is answered from the recipe built for it, which no acquisition has observed.
    it.each(['observation', 'input', 'inputs'])('is refused when its delegate reads its %s', read_ => {
        expect(read({product: {name: `DELEGATE_READS_${read_.toUpperCase()}`}})).toMatchObject({
            status: 'INVALID',
            description: null,
            diagnostics: [expect.objectContaining({code: 'UNSUPPORTED_PRODUCT_READ', read: read_, delegate: 'READING', product: `DELEGATE_READS_${read_.toUpperCase()}`})]
        })
    })
})

describe('whether a description may decide an export', () => {
    it('holds for a canonical description, and not for one naming a product', () => {
        const canonical = read().description
        const count = read({product: {name: 'COUNT'}}).description

        expect(isCanonicalDescription(canonical)).toBe(true)
        expect(isCanonicalDescription(count)).toBe(false)
        expect(isCanonicalDescription(read({product: {name: 'DELEGATING', parameters: {year: 2021}}}).description)).toBe(false)
    })
})

const scalar = name => ({name, dataType: {arrayDimensions: 0}})

const products = {
    COUNT: mapProduct({describe: () => ({bands: [scalar('count')], evidence: []})}),
    SELF_NAMING: mapProduct({describe: () => ({bands: [scalar('count')], evidence: [], output: {product: {name: 'OTHER'}}, product: {name: 'OTHER'}})}),
    MALFORMED: mapProduct({describe: () => ({bands: [scalar('count'), scalar('count')], evidence: []})}),
    READS_OBSERVATION: mapProduct({describe: ({observation}) => observation()}),
    READS_INPUT: mapProduct({describe: ({input}) => input()}),
    READS_INPUTS: mapProduct({describe: ({inputs}) => inputs()}),
    REFUSING: mapProduct({describe: () => ({diagnostics: [{code: 'SYNTHETIC_CONFLICT'}]})}),
    REFUSING_AFTER_READING: mapProduct({
        describe: ({observation}) => {
            observation()
            return {diagnostics: [{code: 'SYNTHETIC_CONFLICT'}]}
        }
    }),
    REFUSING_WITH_BANDS: mapProduct({describe: () => ({bands: [scalar('count')], evidence: [], diagnostics: [{code: 'SYNTHETIC_CONFLICT'}]})})
}

const delegating = (delegatesTo, type = delegatesTo) => mapProduct({
    delegatesTo,
    describe: ({delegate}) => delegate({type, model: {year: 2021}})
})

Object.assign(products, {
    DATED: mapProduct({
        parameters: ({recipe, parameters: {year, ...unknown}}) => {
            const shown = year ?? recipe.model.endYear
            const diagnostics = [
                ...(Number.isInteger(shown) ? [] : [{path: ['year']}]),
                ...Object.keys(unknown).map(name => ({path: [name]}))
            ]
            return diagnostics.length ? {diagnostics} : {parameters: {year: shown}}
        },
        describe: ({parameters: {year}}) => ({bands: [scalar(`y${year}`)], evidence: []})
    }),
    DELEGATING: mapProduct({
        parameters: ({parameters}) => ({parameters}),
        delegatesTo: 'MOSAIC',
        describe: ({parameters: {year}, delegate}) => delegate({type: 'MOSAIC', model: {year}})
    }),
    DELEGATING_TO_EITHER: mapProduct({
        parameters: ({parameters}) => ({parameters}),
        delegatesTo: ['MOSAIC', 'OTHER'],
        describe: ({parameters: {type}, delegate}) => delegate({type, model: {year: 2021}})
    }),
    DELEGATING_TO_MALFORMED: delegating('MALFORMED_MOSAIC'),
    DELEGATING_ELSEWHERE: delegating('MOSAIC', 'OTHER'),
    DELEGATING_TO_UNDECLARED: delegating('UNDECLARED'),
    DELEGATING_TO_ROLE: delegating('ROLE_READING'),
    UNDECLARED_DELEGATION: mapProduct({describe: ({delegate}) => delegate({type: 'MOSAIC', model: {year: 2021}})}),
    DELEGATE_READS_OBSERVATION: delegating('READING', 'READING'),
    DELEGATE_READS_INPUT: mapProduct({delegatesTo: 'READING', describe: ({delegate}) => delegate({type: 'READING', model: {read: 'input'}})}),
    DELEGATE_READS_INPUTS: mapProduct({delegatesTo: 'READING', describe: ({delegate}) => delegate({type: 'READING', model: {read: 'inputs'}})}),
    DELEGATING_TO_REFUSING: delegating('REFUSING'),
    DELEGATING_TO_REFUSING_AFTER_READING: delegating('REFUSING_AFTER_READING')
})

const canonical = imageOutputProvider({
    describe: () => ({bands: [{name: 'segments', dataType: {arrayDimensions: 1}}], evidence: []})
})

// Delegates by type, as the registry would answer them. The recipes a product builds are handed to these.
const declarations = {
    SYNTHETIC: canonical,
    MOSAIC: imageOutputProvider({describe: ({recipe}) => ({bands: [scalar(`mosaic_${recipe.model.year}`)], evidence: []})}),
    OTHER: imageOutputProvider({describe: () => ({bands: [scalar('other')], evidence: []})}),
    MALFORMED_MOSAIC: imageOutputProvider({describe: () => ({bands: [scalar('red'), scalar('red')], evidence: []})}),
    ROLE_READING: imageOutputProvider({role: 'image', describe: () => ({bands: [scalar('red')], evidence: []})}),
    READING: imageOutputProvider({describe: access => access[access.recipe.model.read || 'observation']()}),
    REFUSING: imageOutputProvider({describe: () => ({diagnostics: [{code: 'SYNTHETIC_CONFLICT', path: ['model']}]})}),
    REFUSING_AFTER_READING: imageOutputProvider({
        describe: ({observation}) => {
            observation()
            return {diagnostics: [{code: 'SYNTHETIC_CONFLICT', path: ['model']}]}
        }
    })
}

const read = ({product, recipeDiagnostics = new Map(), productsByName = products} = {}) => readImageOutput({
    graph: {recipes: [{id: 'root', type: 'SYNTHETIC', model: {endYear: 2000}}], edges: [], diagnostics: [], recipeDiagnostics},
    declarationFor: recipe => declarations[recipe.type],
    observationFor: () => undefined,
    product,
    productFor: (_recipe, name) => productsByName[name]
})
