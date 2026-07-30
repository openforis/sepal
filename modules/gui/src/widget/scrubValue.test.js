import {clampValue, toggleMinMax, valueFromVerticalDrag} from './scrubValue'

describe('valueFromVerticalDrag', () => {
    it('increases the value when dragging up', () => {
        expect(valueFromVerticalDrag({startValue: 0.5, startY: 100, currentY: 80, min: 0, max: 1, sensitivity: 100}))
            .toBeCloseTo(0.7)
    })

    it('decreases the value when dragging down', () => {
        expect(valueFromVerticalDrag({startValue: 0.5, startY: 100, currentY: 120, min: 0, max: 1, sensitivity: 100}))
            .toBeCloseTo(0.3)
    })

    it('ignores horizontal movement (only y matters)', () => {
        const a = valueFromVerticalDrag({startValue: 0.4, startY: 50, currentY: 30, sensitivity: 100})
        const b = valueFromVerticalDrag({startValue: 0.4, startY: 50, currentY: 30, sensitivity: 100})
        expect(a).toBe(b)
        expect(a).toBeCloseTo(0.6)
    })

    it('clamps at max when dragging far up', () => {
        expect(valueFromVerticalDrag({startValue: 0.9, startY: 100, currentY: 0, min: 0, max: 1, sensitivity: 100})).toBe(1)
    })

    it('clamps at min when dragging far down', () => {
        expect(valueFromVerticalDrag({startValue: 0.1, startY: 100, currentY: 300, min: 0, max: 1, sensitivity: 100})).toBe(0)
    })

    it('scales the sweep across a custom min/max range', () => {
        // sensitivity is px per full min->max sweep. 50px of 200px over range [0,10] -> +2.5.
        expect(valueFromVerticalDrag({startValue: 5, startY: 100, currentY: 50, min: 0, max: 10, sensitivity: 200}))
            .toBeCloseTo(7.5)
        expect(valueFromVerticalDrag({startValue: 5, startY: 100, currentY: 0, min: 0, max: 10, sensitivity: 100})).toBe(10)
    })

    it('respects a non-zero minimum when clamping', () => {
        expect(valueFromVerticalDrag({startValue: 3, startY: 100, currentY: 300, min: 2, max: 10, sensitivity: 100})).toBe(2)
    })

    it('defaults min=0, max=1, sensitivity=100 (full sweep over 100px)', () => {
        expect(valueFromVerticalDrag({startValue: 0, startY: 100, currentY: 0})).toBe(1)
    })
})

describe('toggleMinMax', () => {
    it('toggles the minimum to the maximum', () => {
        expect(toggleMinMax(0, 0, 1)).toBe(1)
    })

    it('toggles any value above the minimum down to the minimum', () => {
        expect(toggleMinMax(0.5, 0, 1)).toBe(0)
        expect(toggleMinMax(1, 0, 1)).toBe(0)
    })

    it('works with a custom range', () => {
        expect(toggleMinMax(2, 2, 10)).toBe(10)
        expect(toggleMinMax(6, 2, 10)).toBe(2)
    })

    it('defaults to the 0..1 range (strict 0 <-> 1)', () => {
        expect(toggleMinMax(0)).toBe(1)
        expect(toggleMinMax(0.3)).toBe(0)
    })
})

describe('clampValue', () => {
    it('clamps to [min, max]', () => {
        expect(clampValue(-1, 0, 1)).toBe(0)
        expect(clampValue(2, 0, 1)).toBe(1)
        expect(clampValue(5, 0, 10)).toBe(5)
    })
})
