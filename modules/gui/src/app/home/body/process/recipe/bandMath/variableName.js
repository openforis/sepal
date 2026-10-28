// A name for a new input or calculation, `prefix` followed by a number: one past the highest any input or calculation
// has, or any calculation reads. Existing names are never changed, and the name of an input or calculation since removed
// that a calculation still reads is not given to another, which would silently satisfy that reference. Where one past
// the highest would be longer than a name may be, the lowest number no such name has.
export const newVariableName = (prefix, {images = [], calculations = []}) => {
    const taken = new Set([
        ...images.map(({name}) => name),
        ...calculations.flatMap(({name, usedBands = []}) => [name, ...usedBands.map(({imageName}) => imageName)])
    ])
    const pattern = new RegExp(`^${prefix}(\\d+)$`)
    const highest = [...taken]
        .map(name => pattern.exec(name || ''))
        .filter(Boolean)
        .map(([, digits]) => BigInt(digits))
        .reduce((highest, number) => number > highest ? number : highest, 0n)
    const next = `${prefix}${highest + 1n}`
    return next.length <= MAX_NAME_LENGTH ? next : lowestFree(prefix, taken)
}

// The longest variable name the input and calculation editors accept.
const MAX_NAME_LENGTH = 30

const lowestFree = (prefix, taken, number = 1) =>
    taken.has(`${prefix}${number}`) ? lowestFree(prefix, taken, number + 1) : `${prefix}${number}`
