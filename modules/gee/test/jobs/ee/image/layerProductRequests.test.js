import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

// The editor's histogram and distinct-value requests about a layer's image, through each handler's worker with its
// execution boundary - the image factory - substituted. They must build the image the layer's preview builds: the
// same product arguments reach the factory, and the band asked about stays the one selected.
//
// `job` is replaced by the worker it wraps, so each handler's own argument handling runs unchanged.

const imageFactory = mock.fn(() => ({getImage$: () => ({pipe: () => ({})})}))

mock.module('#gee/jobs/job', {
    exports: {
        job: ({worker$}) => worker$
    }
})
mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: imageFactory
    }
})
mock.module('#sepal/ee/ee', {
    exports: {
        default: {}
    }
})
mock.module('#sepal/ee/aoi', {
    exports: {
        toGeometry$: () => ({pipe: () => ({})})
    }
})

const {default: histogram$} = await import('#gee/jobs/ee/image/histogram')
const {default: distinctBandValues$} = await import('#gee/jobs/ee/image/distinctBandValues')

const recipe = {id: 'ccdc-1', type: 'CCDC', model: {}}

beforeEach(() => imageFactory.mock.resetCalls())

for (const [name, worker$] of [
    ['histogram', histogram$],
    ['distinct band values', distinctBandValues$]
]) {
    describe(`the ${name} of a layer's image`, () => {
        it('is built from the product the layer shows', () => {
            worker$({requestArgs: {recipe, band: 'count', mapBounds: [0, 0, 1, 1], visualizationType: 'COUNT'}})

            assert.deepEqual(
                callsOf(imageFactory),
                [[recipe, {visualizationType: 'COUNT', selection: ['count']}]]
            )
        })

        it('selects the band asked about, whatever else the request carries', () => {
            worker$({requestArgs: {recipe, band: 'count', mapBounds: [0, 0, 1, 1], selection: ['other']}})

            assert.deepEqual(callsOf(imageFactory), [[recipe, {selection: ['count']}]])
        })
    })
}
