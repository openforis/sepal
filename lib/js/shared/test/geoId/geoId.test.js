import {defaultBufferMeters, isBufferMeters, isGeoId, minBufferMeters, parseGeoId} from '#sepal/geoId/geoId'

const GEOID = '40df4325-744f-8fae-8e46-049080be5554'
const OTHER_GEOID = '0b9e6c0a-1d2f-8a3b-9c4d-5e6f7a8b9c0d'

describe('reading a GeoID from pasted text', () => {
    it.each([
        ['a bare GeoID', GEOID],
        ['surrounding whitespace and quotes', `  "${GEOID}"\n`],
        ['upper case', GEOID.toUpperCase()],
        ['no hyphens', GEOID.replaceAll('-', '')],
        ['a resolver URL with a query string', `https://data.apps.fao.org/geoid/${GEOID}?f=wkt`],
        ['a URL on another host', `https://data.fao.org/geoid/${GEOID}`],
        ['surrounding prose', `The plot is GeoID ${GEOID}, registered last year.`],
        ['the same GeoID twice', `${GEOID} (https://data.apps.fao.org/geoid/${GEOID.toUpperCase()})`]
    ])('finds the canonical GeoID in %s', (_case, text) => {
        expect(parseGeoId(text)).toEqual({geoId: GEOID})
    })

    it.each([
        ['empty text', ''],
        ['missing text', undefined],
        ['text without a UUID', 'https://geoid.openforis.org/'],
        ['a truncated UUID', GEOID.slice(0, -1)],
        ['a longer hex string', `${GEOID.replaceAll('-', '')}ab`]
    ])('finds none in %s', (_case, text) => {
        expect(parseGeoId(text)).toEqual({error: 'NONE'})
    })

    it('refuses text naming two different GeoIDs', () => {
        expect(parseGeoId(`${GEOID} ${OTHER_GEOID}`)).toEqual({error: 'MULTIPLE'})
    })

    it('accepts any UUID version, leaving existence to the service', () => {
        const version4 = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'

        expect(parseGeoId(version4)).toEqual({geoId: version4})
    })
})

describe('a canonical GeoID', () => {
    it('is a lower-case hyphenated UUID', () => {
        expect(isGeoId(GEOID)).toBe(true)
        expect(isGeoId(GEOID.toUpperCase())).toBe(false)
        expect(isGeoId(GEOID.replaceAll('-', ''))).toBe(false)
        expect(isGeoId(` ${GEOID}`)).toBe(false)
        expect(isGeoId(undefined)).toBe(false)
    })
})

describe('a buffer', () => {
    it.each(['Point', 'MultiPoint'])('defaults to 250 m around a %s', geometryType => {
        expect(defaultBufferMeters(geometryType)).toBe(250)
    })

    it.each(['Polygon', 'MultiPolygon'])('defaults to none around a %s', geometryType => {
        expect(defaultBufferMeters(geometryType)).toBe(0)
    })

    it.each(['Point', 'MultiPoint'])('around a %s is a whole number of metres, at least 10', geometryType => {
        expect(minBufferMeters(geometryType)).toBe(10)
        expect([10, 250, 10001, 1000000].map(value => isBufferMeters(value, geometryType))).toEqual(Array(4).fill(true))
        expect([0, 9].map(value => isBufferMeters(value, geometryType))).toEqual([false, false])
    })

    it.each(['Polygon', 'MultiPolygon'])('around a %s is a whole number of metres, at least 0', geometryType => {
        expect(minBufferMeters(geometryType)).toBe(0)
        expect([0, 5, 10001, 1000000].map(value => isBufferMeters(value, geometryType))).toEqual(Array(4).fill(true))
        expect(isBufferMeters(-1, geometryType)).toBe(false)
    })

    it('before the geometry is known, is any buffer some geometry accepts', () => {
        expect([0, 5, 10001].map(value => isBufferMeters(value))).toEqual([true, true, true])
        expect(isBufferMeters(-1)).toBe(false)
    })

    it.each([
        ['fractional', 0.5],
        ['not a number', NaN],
        ['infinite', Infinity],
        ['beyond the safe integers', Number.MAX_SAFE_INTEGER + 1],
        ['a string', '250'],
        ['missing', undefined],
        ['null', null]
    ])('is never %s', (_case, value) => {
        expect(isBufferMeters(value, 'Polygon')).toBe(false)
        expect(isBufferMeters(value, 'Point')).toBe(false)
    })
})
