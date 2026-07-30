import {describe, expect, it} from 'vitest'

import {
    formatDistance,
    minDistanceFloorViolation,
    minDistanceGridFloor,
    minDistancePixelSize
} from './minDistanceValidation'

// The production module the Sample Arrangement panel uses for derived Minimum distance validation. The rule
// depends on the Stratification grid, which another panel owns, so it must react to external grid and mode
// changes without ever rewriting the entered value.
const stratified = extra => ({unstratified: false, arrangementStrategy: 'SYSTEMATIC', stratificationGrid: {scale: 10}, ...extra})

describe('minDistanceGridFloor applicability', () => {
    it('is two grid pixels (2 * Stratification Scale) for stratified systematic', () => {
        expect(minDistanceGridFloor(stratified())).toBe(20)
        expect(minDistanceGridFloor(stratified({stratificationGrid: {scale: 30}}))).toBe(60)
    })

    it('does not apply to unstratified systematic or to random', () => {
        expect(minDistanceGridFloor(stratified({unstratified: true}))).toBeNull()
        expect(minDistanceGridFloor(stratified({arrangementStrategy: 'RANDOM'}))).toBeNull()
    })
})

describe('minDistanceFloorViolation', () => {
    it('reports nothing for a blank value: it resolves to the floor at export', () => {
        expect(minDistanceFloorViolation(stratified({minDistance: ''}))).toBeNull()
        expect(minDistanceFloorViolation(stratified({minDistance: undefined}))).toBeNull()
        expect(minDistanceFloorViolation(stratified({minDistance: null}))).toBeNull()
    })

    it('reports the exact numeric arguments for a value below the floor', () => {
        expect(minDistanceFloorViolation(stratified({minDistance: 1})))
            .toEqual({value: 1, pixelSize: 10, minimum: 20})
        expect(minDistanceFloorViolation(stratified({minDistance: 19})))
            .toEqual({value: 19, pixelSize: 10, minimum: 20})
    })

    it('reports nothing at or above the floor', () => {
        expect(minDistanceFloorViolation(stratified({minDistance: 20}))).toBeNull()
        expect(minDistanceFloorViolation(stratified({minDistance: 60}))).toBeNull()
    })

    // The field's own .number() validator owns this; formatting it here would render "NaN m".
    it('leaves a non-numeric value to the field validators rather than reporting NaN', () => {
        expect(minDistanceFloorViolation(stratified({minDistance: 'abc'}))).toBeNull()
        expect(minDistanceFloorViolation(stratified({minDistance: NaN}))).toBeNull()
    })

    it('never applies to unstratified systematic or random, whatever the value', () => {
        expect(minDistanceFloorViolation(stratified({minDistance: 1, unstratified: true}))).toBeNull()
        expect(minDistanceFloorViolation(stratified({minDistance: 1, arrangementStrategy: 'RANDOM'}))).toBeNull()
    })

    it('revalidates the same entered value when the grid changes, without altering it', () => {
        const minDistance = 20
        expect(minDistanceFloorViolation(stratified({minDistance}))).toBeNull()
        expect(minDistanceFloorViolation(stratified({minDistance, stratificationGrid: {scale: 30}})))
            .toEqual({value: 20, pixelSize: 30, minimum: 60})
        expect(minDistance).toBe(20)
    })

    it('formats decimals without floating-point noise', () => {
        expect(minDistanceFloorViolation(stratified({minDistance: 0.1, stratificationGrid: {scale: 0.15}})))
            .toEqual({value: 0.1, pixelSize: 0.15, minimum: 0.3})
    })
})

describe('minDistancePixelSize', () => {
    it('reports the grid pixel size (Stratification Scale) behind the floor', () => {
        expect(minDistancePixelSize(stratified())).toBe(10)
        expect(minDistancePixelSize(stratified({stratificationGrid: {scale: 30}}))).toBe(30)
    })
})

describe('formatDistance', () => {
    it('trims floating-point noise without forcing decimals', () => {
        expect(formatDistance(0.1 + 0.2)).toBe(0.3)
        expect(formatDistance(20)).toBe(20)
        expect(formatDistance('55.4256')).toBe(55.4256)
    })
})
