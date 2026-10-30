// One serialization per value, whatever the order its objects' keys were written in: what an evidence digest is taken
// over, so the same meaning always digests to the same string, and what equal questions are compared as. Array order
// is meaning and is kept; a key holding undefined is absent, as it is once persisted.
export const canonicalJson = value => JSON.stringify(canonical(value))

const canonical = value => {
    if (Array.isArray(value)) {
        return value.map(item => item === undefined ? null : canonical(item))
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .filter(key => value[key] !== undefined)
                .sort()
                .map(key => [key, canonical(value[key])])
        )
    }
    return value
}
