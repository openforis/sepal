// Named map products: images a recipe's map layer can show other than its canonical IMAGE_OUTPUT, such as CCDC's
// count of fitted observations. A type declares them beside its canonical provider, by names local to the type.
//
// A product is described from its recipe's configuration alone. It reads no observation and no source, which is what
// lets it be answered from the session while only its dependencies' validity is acquired; the resolver refuses a
// provider that asks for more. A product takes no parameters yet. Its identity is the resolver's to attach, never its
// provider's.
//
// Canonical output stays the only export authority: the GUI's export submission refuses a description naming a
// product (isCanonicalDescription). Task resolves canonical output only, so it never holds one.

export const IMAGE_OUTPUT = 'IMAGE_OUTPUT'

export const mapProduct = ({describe, ...unsupported} = {}) =>
    validateMapProduct({describe, ...unsupported})

export const validateMapProduct = product => {
    const {describe, ...unsupported} = product || {}
    if (typeof describe !== 'function') {
        throw new Error(`A map product requires a describe function, got: ${JSON.stringify(describe)}`)
    }
    const unsupportedKeys = Object.keys(unsupported)
    if (unsupportedKeys.length) {
        throw new Error(`A map product declares only describe, got: ${unsupportedKeys.join(', ')}`)
    }
    return product
}

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

// Whether a description is of a recipe's canonical output, the only one an export may be decided by.
export const isCanonicalDescription = description => !description?.output?.product
