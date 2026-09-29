import {jest} from '@jest/globals'
import {firstValueFrom} from 'rxjs'

// What a Planet Mosaic's catalogue answers: its declared output, however it was asked, without resolving its AOI or
// reading any imagery. Which bands execution builds for a request is the live verifier's
// (verify/planetMosaicOutputBands.mjs).

// The BRDF correction histogram matching imports reads Earth Engine at import; nothing here evaluates anything.
jest.unstable_mockModule('#sepal/ee/ee', () => ({default: {Image: {}}}))
const toGeometry$ = jest.fn()
jest.unstable_mockModule('#sepal/ee/aoi', () => ({toGeometry$}))

const {default: mosaic} = await import('#sepal/ee/planet/mosaic')

const DECLARED = ['blue', 'green', 'red', 'nir', 'ndvi', 'ndwi', 'evi', 'evi2', 'savi', 'kndvi']

describe('the bands a Planet Mosaic reports', () => {
    it.each([
        ['nothing', undefined],
        ['an empty selection', {selection: []}],
        ['a subset out of order', {selection: ['kndvi', 'red']}],
        ['a working band a Daily composite carries', {selection: ['dayOfYear']}]
    ])('are its declared bands, whatever it is asked for: %s', async (_case, args) => {
        expect(await reportedBands(planet({source: 'DAILY', assets: ['users/x/daily']}), args)).toEqual(DECLARED)
        expect(toGeometry$).not.toHaveBeenCalled()
    })

    it.each([
        ['basemaps', {source: 'BASEMAPS', assets: ['users/x/basemaps']}],
        ['no sources', undefined]
    ])('are the same over %s', async (_case, sources) => {
        expect(await reportedBands(planet(sources))).toEqual(DECLARED)
    })
})

const planet = sources => ({model: {aoi: {}, dates: {fromDate: '2024-01-01', toDate: '2024-04-01'}, sources, options: {}}})

const reportedBands = (recipe, args) => firstValueFrom(mosaic(recipe, args).getBands$())
