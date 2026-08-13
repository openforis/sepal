import {toTaskAllocation} from './taskAllocation'

// Current persisted (joined-array) model shape - the panels still produce this until rewired.
const joinedModel = {
    stratification: {
        strata: [
            {value: 1, label: 'Forest', color: '#0a0', area: 300, weight: 0.3},
            {value: 2, label: 'Non-forest', color: '#a00', area: 700, weight: 0.7}
        ]
    },
    proportions: {
        anticipatedProportions: [
            {stratum: 1, proportion: 0.48},
            {stratum: 2, proportion: 0.08}
        ]
    },
    sampleAllocation: {
        allocation: [
            {stratum: 1, label: 'Forest', color: '#0a0', area: 300, weight: 0.3, proportion: 0.48, sampleSize: 30},
            {stratum: 2, label: 'Non-forest', color: '#a00', area: 700, weight: 0.7, proportion: 0.08, sampleSize: 70}
        ]
    }
}

describe('toTaskAllocation - current joined-array shape', () => {
    it('materializes the backend contract {stratum, sampleSize, area, color}', () => {
        const rows = toTaskAllocation(joinedModel)
        expect(rows).toHaveLength(2)
        rows.forEach(row => {
            expect(typeof row.stratum).toBe('number')
            expect(Number.isFinite(row.sampleSize)).toBe(true)
            expect(typeof row.area).toBe('number')
            expect(typeof row.color).toBe('string')
        })
        expect(rows.map(({stratum, sampleSize, area, color}) => ({stratum, sampleSize, area, color}))).toEqual([
            {stratum: 1, sampleSize: 30, area: 300, color: '#0a0'},
            {stratum: 2, sampleSize: 70, area: 700, color: '#a00'}
        ])
    })

    it('returns null when there is no allocation', () => {
        expect(toTaskAllocation({stratification: {}, proportions: {}, sampleAllocation: {}})).toBe(null)
        expect(toTaskAllocation({})).toBe(null)
    })

    it('defaults missing color and label (color stays a string)', () => {
        const rows = toTaskAllocation({sampleAllocation: {allocation: [{stratum: 3, area: 100, sampleSize: 5}]}})
        expect(rows[0]).toMatchObject({stratum: 3, sampleSize: 5, area: 100, color: '#000000', label: '3'})
        expect(typeof rows[0].color).toBe('string')
    })

    it('fills missing fields from stratification.strata (matched by value) and proportions', () => {
        const rows = toTaskAllocation({
            stratification: {strata: [{value: 1, label: 'Forest', color: '#0a0', area: 300, weight: 0.3}]},
            proportions: {anticipatedProportions: [{stratum: 1, proportion: 0.48}]},
            sampleAllocation: {allocation: [{stratum: 1, sampleSize: 30}]}
        })
        expect(rows[0]).toEqual({
            stratum: 1, sampleSize: 30, area: 300, color: '#0a0', label: 'Forest', weight: 0.3, proportion: 0.48
        })
    })

    it('derives stratum from entry.value when stratum is absent', () => {
        const rows = toTaskAllocation({
            sampleAllocation: {allocation: [{value: 5, area: 50, color: '#123456', label: 'Five', sampleSize: 9}]}
        })
        expect(rows[0]).toMatchObject({stratum: 5, sampleSize: 9, color: '#123456', label: 'Five'})
    })

    it('normalizes numeric-string form data and matches numeric strata fallback', () => {
        const rows = toTaskAllocation({
            stratification: {strata: [{value: 1, area: 300, label: 'Forest', color: '#0a0'}]},
            sampleAllocation: {allocation: [{stratum: '1', sampleSize: '30'}]}
        })
        expect(rows[0]).toMatchObject({stratum: 1, sampleSize: 30, area: 300, color: '#0a0', label: 'Forest'})
        expect(typeof rows[0].stratum).toBe('number')
        expect(typeof rows[0].sampleSize).toBe('number')
        expect(typeof rows[0].area).toBe('number')
    })
})

describe('toTaskAllocation - unstratified (single synthetic stratum)', () => {
    it('carries the AOI area onto the single allocation row', () => {
        const unstratifiedModel = {
            stratification: {
                skip: true,
                strata: [{value: 1, stratum: 1, label: 'Unstratified', color: '#000000', area: 1.2e9, weight: 1}]
            },
            proportions: {skip: true},
            sampleAllocation: {
                manual: [true],
                allocation: [{stratum: 1, sampleSize: 100}]
            }
        }
        const rows = toTaskAllocation(unstratifiedModel)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({stratum: 1, sampleSize: 100, area: 1.2e9, weight: 1})
        expect(Number.isFinite(rows[0].area)).toBe(true)
    })
})
