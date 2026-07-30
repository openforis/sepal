import {nestedLevel} from '#sepal/ee/samplingDesign/systematicLatticeMath'

// stratifiedSystematicExactCandidates computes the nested level from a 512-entry lookup indexed by
// (posmod(i,16), posmod(j,32)). These are DOMAIN/INVARIANT tests on the nested-level CONTRACT the lookup encodes
// (`nestedLevel`, the JS mirror of the EE formula): exact periodicity over i mod 16 / j mod 32, half-levels, and
// correct residues for negative indices. They do NOT exercise the function's copied lookup itself - that copy is
// self-contained inside the Code Editor function and is validated only against the live nested-level calculation
// over positive/negative i/j in the live candidate comparison.

const buildTable = () => {
    const table = []
    for (let j = 0; j < 32; j++) {
        for (let i = 0; i < 16; i++) {
            table.push(nestedLevel(i, j))
        }
    }
    return table
}

const lookupIndex = (i, j) => ((((j % 32) + 32) % 32) * 16) + (((i % 16) + 16) % 16)

describe('nested-level contract (invariants the lookup encodes)', () => {
    const table = buildTable()

    it('is periodic over i mod 16 and j mod 32 for translated positive AND negative indices', () => {
        let mismatches = 0
        for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 32; j++) {
                for (let a = -4; a <= 4; a++) {
                    for (let b = -4; b <= 4; b++) {
                        if (nestedLevel(i + 16 * a, j + 32 * b) !== table[lookupIndex(i, j)]) {
                            mismatches++
                        }
                    }
                }
            }
        }
        expect(mismatches).toBe(0)
    })

    it('includes the exact half-level values of the contract', () => {
        expect(nestedLevel(0, 0)).toBe(4.5)
        expect(nestedLevel(8, 16)).toBe(4)
        expect(nestedLevel(2, 4)).toBe(2)
        expect(nestedLevel(1, 3)).toBe(0)
        expect(table.filter(value => value === 0.5).length).toBeGreaterThan(0)
        expect(table.every(value => value >= 0)).toBe(true)
    })

    it('all odd-j rows are level 0 (no cell/half qualifies)', () => {
        for (let j = 1; j < 32; j += 2) {
            for (let i = 0; i < 16; i++) {
                expect(nestedLevel(i, j)).toBe(0)
            }
        }
    })

    it('negative i/j select the same lookup cell as their positive residues', () => {
        const cases = [[-1, -1], [-17, -33], [-16, -32], [123, -77], [-2500, 9001]]
        for (const [i, j] of cases) {
            expect(nestedLevel(i, j)).toBe(table[lookupIndex(i, j)])
        }
    })
})
