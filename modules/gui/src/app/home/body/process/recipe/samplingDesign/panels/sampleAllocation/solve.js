export const findRoot = ({fun, min, max}) => {
    const mid = Math.floor((min + max) / 2)
    const midValue = fun(mid)
    if (isNaN(midValue)) {
        return midValue
    }
    return midValue === 0 || mid === min
        ? mid
        // : minValue * midValue < 0
        : fun(max) * midValue > 0
            ? findRoot({fun, min, max: mid})
            : findRoot({fun, min: mid, max})
}
