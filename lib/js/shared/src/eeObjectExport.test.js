import assert from 'node:assert/strict'
import {test} from 'node:test'

import {assertEEObjectExport} from './eeObjectExport.js'

const expression = {result: '0', values: {'0': {constantValue: 1}}}

for (const destination of ['DRIVE', 'SEPAL']) {
    test(`${destination} tables reject formats that would silently become CSV`, () => {
        for (const fileFormat of ['TF_RECORD', 'TFRecord', 'GEO_TIFF', 'invalid', '']) {
            assert.throws(
                () => assertEEObjectExport({kind: 'TABLE', destination, expression, fileFormat}),
                /Unsupported table export fileFormat/
            )
        }
    })

    test(`${destination} tables accept supported formats and the CSV default`, () => {
        for (const fileFormat of [undefined, null, 'CSV', 'GeoJSON', 'KML', 'KMZ', 'SHP']) {
            assert.doesNotThrow(() => assertEEObjectExport({kind: 'TABLE', destination, expression, fileFormat}))
        }
    })

    test(`${destination} images still accept TFRecord`, () => {
        for (const fileFormat of ['TF_RECORD', 'TFRecord']) {
            assert.doesNotThrow(() => assertEEObjectExport({kind: 'IMAGE', destination, expression, fileFormat}))
        }
    })
}
