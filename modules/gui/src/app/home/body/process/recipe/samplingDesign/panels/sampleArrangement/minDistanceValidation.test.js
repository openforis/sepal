import {describe, expect, it} from 'vitest'

import {minDistanceFloorViolation} from './minDistanceValidation'

const stratified = extra => ({unstratified: false, arrangementStrategy: 'SYSTEMATIC', stratificationGrid: {scale: 10}, ...extra})

describe('minDistanceFloorViolation', () => {
    it('reports nothing for a blank value: it resolves to the floor at export', () => {
        expect(minDistanceFloorViolation(stratified({minDistance: ''}))).toBeNull()
        expect(minDistanceFloorViolation(stratified({minDistance: undefined}))).toBeNull()
        expect(minDistanceFloorViolation(stratified({minDistance: null}))).toBeNull()
    })

    // The field's own .number() validator owns a non-numeric entry; formatting it here would render "NaN m".
    it('leaves a non-numeric value to the field validators rather than reporting NaN', () => {
        expect(minDistanceFloorViolation(stratified({minDistance: 'abc'}))).toBeNull()
        expect(minDistanceFloorViolation(stratified({minDistance: NaN}))).toBeNull()
    })

    it('reports the exact numeric arguments (floor is two Stratification Scale pixels) below the floor', () => {
        expect(minDistanceFloorViolation(stratified({minDistance: 1})))
            .toEqual({value: 1, pixelSize: 10, minimum: 20})
        expect(minDistanceFloorViolation(stratified({minDistance: 19})))
            .toEqual({value: 19, pixelSize: 10, minimum: 20})
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
})
