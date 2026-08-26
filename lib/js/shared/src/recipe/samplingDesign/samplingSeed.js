export const requiresSamplingSeed = ({arrangementStrategy, sampleSizeStrategy, gridOrigin} = {}) =>
    arrangementStrategy === 'RANDOM'
        || sampleSizeStrategy === 'EXACT'
        || gridOrigin === 'SEEDED'

// Seeds cross application boundaries as JavaScript Numbers, so they must be safe integers to remain exact.
export const isValidSamplingSeed = seed => {
    if (seed == null || seed === '' || !/^\d+$/.test(String(seed))) {
        return false
    }
    const numericSeed = Number(seed)
    return numericSeed >= 1 && Number.isSafeInteger(numericSeed)
}
