// Named map products: images a recipe's map layer can show other than its canonical IMAGE_OUTPUT, such as CCDC's
// count of fitted observations. A type declares them beside its canonical provider, by names local to the type.
//
// A product is described from its recipe's configuration alone. It reads no observation and no source, which is what
// lets it be answered from the session while only its dependencies' validity is acquired; the resolver refuses a
// provider that asks for more. Its identity is the resolver's to attach, never its provider's.
//
// A product taking parameters declares `parameters({recipe, parameters})`, answering {parameters} normalized or
// {diagnostics: [{path}]} naming what it refuses; one declaring none takes none. A product whose image is another
// type's declares `delegatesTo` that type, or the distinct types it chooses among, and is described by the canonical
// declaration of the type of the recipe it builds, which must be one listed. The delegate is held to the same terms:
// configuration alone. Whether each type it lists declares an output that could be described so is checked once every
// type is registered, without running any provider.
//
// Canonical output stays the only export authority: the GUI's export submission refuses a description naming a
// product (isCanonicalDescription). Task resolves canonical output only, so it never holds one.

import {NO_IMAGE_OUTPUT} from './provider.js'

export const IMAGE_OUTPUT = 'IMAGE_OUTPUT'

export const mapProduct = ({describe, parameters, delegatesTo, ...unsupported} = {}) =>
    validateMapProduct({
        describe,
        ...(parameters === undefined ? {} : {parameters}),
        ...(delegatesTo === undefined ? {} : {delegatesTo}),
        ...unsupported
    })

export const validateMapProduct = product => {
    const {describe, parameters, delegatesTo, ...unsupported} = product || {}
    if (typeof describe !== 'function') {
        throw new Error(`A map product requires a describe function, got: ${JSON.stringify(describe)}`)
    }
    if (parameters !== undefined && typeof parameters !== 'function') {
        throw new Error(`A map product declares its parameters as a function, got: ${JSON.stringify(parameters)}`)
    }
    if (delegatesTo !== undefined && !isDelegation(delegatesTo)) {
        throw new Error(`A map product delegates to a non-blank recipe type, or a list of distinct ones, got: ${JSON.stringify(delegatesTo)}`)
    }
    const unsupportedKeys = Object.keys(unsupported)
    if (unsupportedKeys.length) {
        throw new Error(`A map product declares only describe, parameters and delegatesTo, got: ${unsupportedKeys.join(', ')}`)
    }
    return product
}

const isTypeName = value => typeof value === 'string' && value.trim().length > 0

const isDelegation = delegatesTo => Array.isArray(delegatesTo)
    ? delegatesTo.length > 0 && delegatesTo.every(isTypeName) && new Set(delegatesTo).size === delegatesTo.length
    : isTypeName(delegatesTo)

// The types a product may be described by, however it declared them; none for a product that does not delegate.
export const delegateTypes = ({delegatesTo}) =>
    delegatesTo === undefined ? [] : [].concat(delegatesTo)

export const validateMapProducts = (type, mapProducts) => {
    if (mapProducts === null || typeof mapProducts !== 'object' || Array.isArray(mapProducts)) {
        throw new Error(`Recipe type ${type} declares its map products as an object by name, got: ${JSON.stringify(mapProducts)}`)
    }
    Object.entries(mapProducts).forEach(([name, product]) => {
        if (name.trim().length === 0 || name === IMAGE_OUTPUT) {
            throw new Error(`Recipe type ${type} names a map product ${JSON.stringify(name)}; its canonical output is not a map product`)
        }
        validateMapProduct(product)
    })
    return mapProducts
}

// Every type a product delegates to, against the complete set of definitions by type: a delegate must declare an
// output, and one that reads its role's source could not be described from a recipe built for it.
export const validateMapProductDelegates = definitionsByType =>
    definitionsByType.forEach(({type, mapProducts = {}}) =>
        Object.entries(mapProducts).forEach(([name, product]) => delegateTypes(product).forEach(delegatesTo => {
            const delegate = definitionsByType.get(delegatesTo)?.imageOutput
            if (!delegate || delegate === NO_IMAGE_OUTPUT) {
                throw new Error(`Recipe type ${type} delegates its map product ${name} to ${delegatesTo}, which declares no image output`)
            }
            if (delegate.role !== undefined) {
                throw new Error(`Recipe type ${type} delegates its map product ${name} to ${delegatesTo}, whose output reads its ${delegate.role} source`)
            }
        }))
    )

// Whether a description is of a recipe's canonical output, the only one an export may be decided by.
export const isCanonicalDescription = description => !description?.output?.product
