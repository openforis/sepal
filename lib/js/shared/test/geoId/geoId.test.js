import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {format} from 'node:util'

import {defaultBufferMeters, isBufferMeters, isGeoId, minBufferMeters, parseGeoId} from '#sepal/geoId/geoId'

const GEOID = '40df4325-744f-8fae-8e46-049080be5554'
const OTHER_GEOID = '0b9e6c0a-1d2f-8a3b-9c4d-5e6f7a8b9c0d'

describe('reading a GeoID from pasted text', () => {
    for (const [_case, text] of [
        ['a bare GeoID', GEOID],
        ['surrounding whitespace and quotes', `  "${GEOID}"\n`],
        ['upper case', GEOID.toUpperCase()],
        ['no hyphens', GEOID.replaceAll('-', '')],
        ['a resolver URL with a query string', `https://data.apps.fao.org/geoid/${GEOID}?f=wkt`],
        ['a URL on another host', `https://data.fao.org/geoid/${GEOID}`],
        ['surrounding prose', `The plot is GeoID ${GEOID}, registered last year.`],
        ['the same GeoID twice', `${GEOID} (https://data.apps.fao.org/geoid/${GEOID.toUpperCase()})`]
    ]) {
        it(format('finds the canonical GeoID in %s', _case), () => {
            assert.deepEqual(parseGeoId(text), {geoId: GEOID})
        })
    }

    for (const [_case, text] of [
        ['empty text', ''],
        ['missing text', undefined],
        ['text without a UUID', 'https://geoid.openforis.org/'],
        ['a truncated UUID', GEOID.slice(0, -1)],
        ['a longer hex string', `${GEOID.replaceAll('-', '')}ab`]
    ]) {
        it(format('finds none in %s', _case), () => {
            assert.deepEqual(parseGeoId(text), {error: 'NONE'})
        })
    }

    it('refuses text naming two different GeoIDs', () => {
        assert.deepEqual(parseGeoId(`${GEOID} ${OTHER_GEOID}`), {error: 'MULTIPLE'})
    })

    it('accepts any UUID version, leaving existence to the service', () => {
        const version4 = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'

        assert.deepEqual(parseGeoId(version4), {geoId: version4})
    })
})

describe('a canonical GeoID', () => {
    it('is a lower-case hyphenated UUID', () => {
        assert.equal(isGeoId(GEOID), true)
        assert.equal(isGeoId(GEOID.toUpperCase()), false)
        assert.equal(isGeoId(GEOID.replaceAll('-', '')), false)
        assert.equal(isGeoId(` ${GEOID}`), false)
        assert.equal(isGeoId(undefined), false)
    })
})

describe('a buffer', () => {
    for (const geometryType of ['Point', 'MultiPoint']) {
        it(format('defaults to 250 m around a %s', geometryType), () => {
            assert.equal(defaultBufferMeters(geometryType), 250)
        })
    }

    for (const geometryType of ['Polygon', 'MultiPolygon']) {
        it(format('defaults to none around a %s', geometryType), () => {
            assert.equal(defaultBufferMeters(geometryType), 0)
        })
    }

    for (const geometryType of ['Point', 'MultiPoint']) {
        it(format('around a %s is a whole number of metres, at least 10', geometryType), () => {
            assert.equal(minBufferMeters(geometryType), 10)
            assert.deepEqual([10, 250, 10001, 1000000].map(value => isBufferMeters(value, geometryType)), Array(4).fill(true))
            assert.deepEqual([0, 9].map(value => isBufferMeters(value, geometryType)), [false, false])
        })
    }

    for (const geometryType of ['Polygon', 'MultiPolygon']) {
        it(format('around a %s is a whole number of metres, at least 0', geometryType), () => {
            assert.equal(minBufferMeters(geometryType), 0)
            assert.deepEqual([0, 5, 10001, 1000000].map(value => isBufferMeters(value, geometryType)), Array(4).fill(true))
            assert.equal(isBufferMeters(-1, geometryType), false)
        })
    }

    it('before the geometry is known, is any buffer some geometry accepts', () => {
        assert.deepEqual([0, 5, 10001].map(value => isBufferMeters(value)), [true, true, true])
        assert.equal(isBufferMeters(-1), false)
    })

    for (const [_case, value] of [
        ['fractional', 0.5],
        ['not a number', NaN],
        ['infinite', Infinity],
        ['beyond the safe integers', Number.MAX_SAFE_INTEGER + 1],
        ['a string', '250'],
        ['missing', undefined],
        ['null', null]
    ]) {
        it(format('is never %s', _case), () => {
            assert.equal(isBufferMeters(value, 'Polygon'), false)
            assert.equal(isBufferMeters(value, 'Point'), false)
        })
    }
})
