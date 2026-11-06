import {describe, expect, it} from 'vitest'

import {landTrendrChart, landTrendrExportRecords} from './landTrendrChart'

describe('a LandTrendr chart exported', () => {
    // Its observations are annual composites and its plotted error bars are zero placeholders: neither a date nor an
    // uncertainty is exported.
    it('gives each year its annual composite and fitted value, with the vertices LandTrendr returned', () => {
        const chart = landTrendrChart({band: 'nbr', latLng: PIXEL, segments: {LandTrendr: [[2000, 2001, 2002], [10, 20, 30], [11, 21, 31], [1, 0, 1]]}})

        expect(landTrendrExportRecords(chart)).toStrictEqual([
            observation(2000, 10), observation(2001, 20), observation(2002, 30),
            model(2000, 11, true), model(2001, 21, false), model(2002, 31, true)
        ])
    })

    it('keeps zero and negative values, and leaves a missing one blank', () => {
        const chart = landTrendrChart({band: 'nbr', latLng: PIXEL, segments: {LandTrendr: [[2000, 2001], [0, null], [-5, null], [1, 0]]}})

        expect(landTrendrExportRecords(chart)).toStrictEqual([
            observation(2000, 0), observation(2001, null),
            model(2000, -5, true), model(2001, null, false)
        ])
    })

    it('has nothing to export without years', () => {
        expect(landTrendrChart({band: 'nbr', latLng: PIXEL, segments: {LandTrendr: [[], [], [], []]}}).empty).toBe(true)
        expect(landTrendrChart({band: 'nbr', latLng: PIXEL, segments: {}}).empty).toBe(true)
    })
})

const PIXEL = {lat: 1, lng: 2}

function observation(year, value) {
    return {series: 'observation', year, value}
}

function model(year, value, vertex) {
    return {series: 'model', year, value, vertex}
}
