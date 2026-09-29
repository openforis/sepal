import {jest} from '@jest/globals'
import {firstValueFrom} from 'rxjs'

// What a BAYTS Historical's catalogue answers: its declared output, however it was asked, without building a radar
// mosaic or resolving its AOI. Which bands execution returns is the witness's (historicalOutputBands.node.test.mjs)
// and the live verifier's (verify/baytsHistoricalOutputBands.mjs).

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: {}}))
const imageFactory = jest.fn()
jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({default: imageFactory}))
const toGeometry$ = jest.fn()
jest.unstable_mockModule('#sepal/ee/aoi', () => ({toGeometry$}))

const {default: baytsHistorical} = await import('#sepal/ee/bayts/baytsHistorical')

const pass = suffix => ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit', 'VV_speckle', 'VH_speckle']
    .map(statistic => `${statistic}_${suffix}`)

describe('the bands a BAYTS Historical reports', () => {
    it.each([
        ['nothing', undefined],
        ['a bare selection', {selection: ['orbit_asc']}],
        ['output bands out of order', {selection: ['VH_std_asc', 'VV_mean_desc'], outputBands: ['VH_std_asc', 'VV_mean_desc']}]
    ])('are every pass\'s statistics in the order its model stores the passes, whatever it is asked for: %s', async (_case, args) => {
        expect(await reported(historical({orbits: ['DESCENDING', 'ASCENDING']}), args)).toEqual([...pass('desc'), ...pass('asc')])
        expect(imageFactory).not.toHaveBeenCalled()
        expect(toGeometry$).not.toHaveBeenCalled()
    })

    it.each([
        ['no options', {}, /INCOMPLETE_IMAGE_OUTPUT/],
        ['an unknown pass', {options: {orbits: ['SIDEWAYS']}}, /MALFORMED_IMAGE_OUTPUT/],
        ['a pass wrapped in a list', {options: {orbits: [['ASCENDING']]}}, /MALFORMED_IMAGE_OUTPUT/],
        ['a pass twice', {options: {orbits: ['ASCENDING', 'ASCENDING']}}, /DUPLICATE_BAND_NAME/]
    ])('are refused for %s, naming why', async (_case, model, reason) => {
        await expect(reported({model})).rejects.toThrow(reason)
    })
})

const historical = options => ({model: {aoi: {}, dates: {}, options}})

const reported = (recipe, args) => firstValueFrom(baytsHistorical(recipe, args).getBands$())
