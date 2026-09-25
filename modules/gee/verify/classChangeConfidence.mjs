// What Class Change builds, pixel by pixel, for each way its two images can carry probability bands, on live Earth
// Engine. A transition needs only the classes; a confidence needs probabilities on both images and is masked
// where either holds none, leaving minConfidence nothing to act on. Checks both bands' values and masks at one pixel,
// at a zero and a nonzero minConfidence, and fails on any difference from what is expected.
//
// Runs the real Class Change calculation over synthetic constant images: only imageFactory is substituted, so each
// input resolves to its synthetic image. Read-only: nothing is saved and no asset is written. Authenticates with the
// service account. Needs Node's module mocks:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node --experimental-test-module-mocks verify/classChangeConfidence.mjs

import {mock} from 'node:test'

import _ from 'lodash'
import {firstValueFrom, of} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import ee from '#sepal/ee/ee'

const LEGEND = [{value: 1, label: 'Forest'}, {value: 2, label: 'Other'}]
const MASKED = null

// From class 1 to class 2, which is transition 2. Where confidence falls below minConfidence, both are replaced by the
// more probable class, 1 here, which is transition 1.
const CASES = [
    {
        name: 'complete, matching probabilities',
        from: {class: 1, probability_1: 80, probability_2: 20},
        to: {landcover: 2, probability_1: 30, probability_2: 70},
        expected: {0: {transition: 2, confidence: 50}, 60: {transition: 1, confidence: 50}}
    },
    {
        name: 'partial: the to-image lacks probability_2',
        from: {class: 1, probability_1: 80, probability_2: 20},
        to: {landcover: 2, probability_1: 30},
        expected: {0: {transition: 2, confidence: 60}, 60: {transition: 2, confidence: 60}}
    },
    {
        name: 'differing: the to-image has probability_1 and probability_3',
        from: {class: 1, probability_1: 80, probability_2: 20},
        to: {landcover: 2, probability_1: 30, probability_3: 70},
        expected: {0: {transition: 2, confidence: 60}, 60: {transition: 2, confidence: 60}}
    },
    {
        name: 'no probabilities on the to-image',
        from: {class: 1, probability_1: 80, probability_2: 20},
        to: {landcover: 2},
        expected: {0: {transition: 2, confidence: MASKED}, 60: {transition: 2, confidence: MASKED}}
    },
    {
        name: 'no probabilities on the from-image',
        from: {class: 1},
        to: {landcover: 2, probability_1: 30, probability_2: 70},
        expected: {0: {transition: 2, confidence: MASKED}, 60: {transition: 2, confidence: MASKED}}
    },
    {
        name: 'no probabilities on either image',
        from: {class: 1},
        to: {landcover: 2},
        expected: {0: {transition: 2, confidence: MASKED}, 60: {transition: 2, confidence: MASKED}}
    },
    {
        name: 'no probabilities, the from-pixel masked',
        from: {class: 1},
        to: {landcover: 2},
        fromMasked: true,
        expected: {0: {transition: MASKED, confidence: MASKED}, 60: {transition: MASKED, confidence: MASKED}}
    }
]

const synthetic = {}

mock.module('#sepal/ee/imageFactory', {
    exports: {default: ({id}) => ({getImage$: () => of(synthetic[id].image), getGeometry$: () => of(synthetic[id].region)})}
})

const {default: createClassChange} = await import('#sepal/ee/classChange/classChange')

const callbackPromise = fn =>
    new Promise((resolve, reject) => fn((result, error) => error ? reject(new Error(error)) : resolve(result)))

const evaluate = value => callbackPromise(callback => value.evaluate((result, error) => callback(result, error)))

const authenticate = async () => {
    await callbackPromise(callback =>
        ee.data.authenticateViaPrivateKey(serviceAccountCredentials, () => callback(true), error => callback(null, error))
    )
    await callbackPromise(callback =>
        ee.initialize(null, null, () => callback(true), error => callback(null, error), null, googleProjectId)
    )
    ee.setMaxRetries(0)
}

// What the pixel holds, band by band, with a masked band as null.
const observe = async ({from, to, fromMasked}, minConfidence) => {
    const region = ee.Geometry.Rectangle([10, 10, 10.01, 10.01])
    const pixel = ee.Geometry.Point([10.005, 10.005])
    const image = (bands, masked) => {
        const constant = ee.Image.constant(Object.values(bands)).rename(Object.keys(bands)).toInt().clip(region)
        return masked ? constant.updateMask(0) : constant
    }
    synthetic.from = {image: image(from, fromMasked), region}
    synthetic.to = {image: image(to), region}
    const built = await firstValueFrom(createClassChange({
        model: {
            fromImage: {type: 'ASSET', id: 'from', band: 'class', legendEntries: LEGEND},
            toImage: {type: 'ASSET', id: 'to', band: 'landcover', legendEntries: LEGEND},
            options: {minConfidence}
        }
    }).getImage$())
    const at = image => image.reduceRegion({reducer: ee.Reducer.first(), geometry: pixel, scale: 30})
    const [bandNames, values, masks] = await Promise.all([evaluate(built.bandNames()), evaluate(at(built)), evaluate(at(built.mask()))])
    return {
        bandNames,
        observed: _.mapValues(values, (value, band) => masks[band] ? value : MASKED),
        unmaskedWithoutValue: Object.keys(masks).filter(band => masks[band] && values[band] === null)
    }
}

const main = async () => {
    await authenticate()
    let failures = 0
    for (const testCase of CASES) {
        for (const [minConfidence, expected] of Object.entries(testCase.expected)) {
            const {bandNames, observed, unmaskedWithoutValue} = await observe(testCase, Number(minConfidence))
            const passed = _.isEqual(bandNames, ['transition', 'confidence'])
                && _.isEqual(observed, expected)
                && !unmaskedWithoutValue.length
            failures += passed ? 0 : 1
            console.info(`${passed ? 'PASS' : 'FAIL'} ${testCase.name}, minConfidence ${minConfidence}: ${JSON.stringify({bandNames, observed, expected})}`)
        }
    }
    if (failures) {
        throw new Error(`${failures} case(s) differ from what is expected`)
    }
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
