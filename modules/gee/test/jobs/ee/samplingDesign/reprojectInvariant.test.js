import {readdirSync, readFileSync} from 'fs'
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'

// The full graph gates run against real Earth Engine under modules/gee/verify/, outside CI, because Jest
// cannot construct ee.Projection. This is the crude part that CI CAN hold: exactly one module under
// samplingDesign/ may reproject, and it is the one that locks the categorical source to the Stratification
// grid. A second reproject anywhere here is what previously blew up cost at full scale.
const samplingDesignDir = join(
    dirname(fileURLToPath(import.meta.url)), '../../../../../../lib/js/ee/src/samplingDesign'
)

describe('one reproject in the samplingDesign tree', () => {
    const reprojecting = readdirSync(samplingDesignDir)
        .filter(name => name.endsWith('.js'))
        .filter(name => readFileSync(join(samplingDesignDir, name), 'utf8')
            .split('\n')
            .filter(line => !line.trim().startsWith('//'))
            .some(line => line.includes('.reproject(')))

    it('is applied only by stratificationImage.js', () => {
        expect(reprojecting).toEqual(['stratificationImage.js'])
    })
})
