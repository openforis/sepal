// Whether two sets of samples hold the same rows - each sample's values together, in a given column order - within a
// tolerance, whatever order the samples come in. Each expected row is paired with a distinct actual row agreeing with
// it in every column; values agreeing column by column but paired differently within a sample are different rows.
// Rows are paired as many as can be (a maximum matching), an earlier pairing given up wherever that lets a later row
// pair, so overlapping tolerances never make the answer depend on the order the rows come in. Sets without rows, or
// of different sizes, do not agree.

export const unpairedRows = (actual, expected, tolerance) => {
    const pairedWith = new Array(actual.length).fill(-1)
    const pair = (row, visited) => actual.some((candidate, index) => {
        if (visited.has(index) || !sameRow(candidate, expected[row], tolerance)) {
            return false
        }
        visited.add(index)
        if (pairedWith[index] < 0 || pair(pairedWith[index], visited)) {
            pairedWith[index] = row
            return true
        }
        return false
    })
    const missing = expected.filter((_row, row) => !pair(row, new Set()))
    return {missing, unexpected: actual.filter((_row, index) => pairedWith[index] < 0)}
}

export const sameRows = (actual, expected, tolerance) => {
    if (!actual?.length || actual.length !== expected?.length) {
        return false
    }
    const {missing, unexpected} = unpairedRows(actual, expected, tolerance)
    return !missing.length && !unexpected.length
}

const sameRow = (row, other, tolerance) =>
    row.length === other.length && row.every((value, i) =>
        Number.isFinite(value) && Number.isFinite(other[i]) && Math.abs(value - other[i]) <= tolerance
    )
