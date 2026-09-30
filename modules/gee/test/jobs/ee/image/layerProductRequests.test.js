import {jest} from '@jest/globals'

// The editor's histogram and distinct-value requests about a layer's image, through each handler's worker with its
// execution boundary - the image factory - substituted. They must build the image the layer's preview builds: the
// same product arguments reach the factory, and the band asked about stays the one selected.
//
// `job` is replaced by the worker it wraps, so each handler's own argument handling runs unchanged.

const imageFactory = jest.fn(() => ({getImage$: () => ({pipe: () => ({})})}))

jest.unstable_mockModule('#gee/jobs/job', () => ({job: ({worker$}) => worker$}))
jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({default: imageFactory}))
jest.unstable_mockModule('#sepal/ee/ee', () => ({default: {}}))
jest.unstable_mockModule('#sepal/ee/aoi', () => ({toGeometry$: () => ({pipe: () => ({})})}))

const {default: histogram$} = await import('#gee/jobs/ee/image/histogram')
const {default: distinctBandValues$} = await import('#gee/jobs/ee/image/distinctBandValues')

const recipe = {id: 'ccdc-1', type: 'CCDC', model: {}}

beforeEach(() => imageFactory.mockClear())

describe.each([
    ['histogram', histogram$],
    ['distinct band values', distinctBandValues$]
])('the %s of a layer\'s image', (_name, worker$) => {
    it('is built from the product the layer shows', () => {
        worker$({requestArgs: {recipe, band: 'count', mapBounds: [0, 0, 1, 1], visualizationType: 'COUNT'}})

        expect(imageFactory).toHaveBeenCalledWith(recipe, {visualizationType: 'COUNT', selection: ['count']})
    })

    it('selects the band asked about, whatever else the request carries', () => {
        worker$({requestArgs: {recipe, band: 'count', mapBounds: [0, 0, 1, 1], selection: ['other']}})

        expect(imageFactory).toHaveBeenCalledWith(recipe, {selection: ['count']})
    })
})
