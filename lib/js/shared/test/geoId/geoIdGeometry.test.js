import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {format} from 'node:util'

import {geoIdGeometryProblem} from '#sepal/geoId/geoIdGeometry'

const RING = [[147.38, -33.50], [147.39, -33.50], [147.39, -33.51], [147.38, -33.50]]

describe('a usable GeoID geometry', () => {
    for (const [_case, geometry] of [
        ['a Point', {type: 'Point', coordinates: [12.3456789, 56.7890123]}],
        ['a MultiPoint', {type: 'MultiPoint', coordinates: [[0, 0], [180, 90], [-180, -90]]}],
        ['a Polygon', {type: 'Polygon', coordinates: [RING]}],
        ['a Polygon with a hole', {type: 'Polygon', coordinates: [RING, RING]}],
        ['a MultiPolygon', {type: 'MultiPolygon', coordinates: [[RING], [RING]]}],
        ['a position with an altitude', {type: 'Point', coordinates: [1, 2, 300]}]
    ]) {
        it(format('accepts %s', _case), () => {
            assert.equal(geoIdGeometryProblem(geometry), null)
        })
    }
})

describe('an unusable GeoID geometry', () => {
    for (const [_case, geometry] of [
        ['no geometry', null],
        ['a LineString', {type: 'LineString', coordinates: [[0, 0], [1, 1]]}],
        ['an inherited member as type', {type: 'toString', coordinates: [0, 0]}],
        ['a Point without coordinates', {type: 'Point'}],
        ['a Point with one ordinate', {type: 'Point', coordinates: [1]}],
        ['a non-finite ordinate', {type: 'Point', coordinates: [NaN, 0]}],
        ['a longitude out of range', {type: 'Point', coordinates: [180.5, 0]}],
        ['a latitude out of range', {type: 'Point', coordinates: [0, -91]}],
        ['an empty MultiPoint', {type: 'MultiPoint', coordinates: []}],
        ['an empty Polygon', {type: 'Polygon', coordinates: []}],
        ['an unclosed ring', {type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]]}],
        ['a ring of three positions', {type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]]}],
        ['an empty MultiPolygon', {type: 'MultiPolygon', coordinates: []}],
        ['a MultiPolygon with an empty polygon', {type: 'MultiPolygon', coordinates: [[RING], []]}]
    ]) {
        it(format('rejects %s', _case), () => {
            assert.equal(typeof (geoIdGeometryProblem(geometry)), 'string')
        })
    }
})
