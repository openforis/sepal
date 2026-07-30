import ee from '#sepal/ee/ee'

import {toId} from './featureProperties.js'

// maxError is an internal geometry tolerance in metres. randomPoints has no minimum separation, so rounded
// coordinate IDs can collide; append its seed-stable feature index to keep IDs unique.
export function unstratifiedRandomSample(args) {
    var allocation = args.allocation
    var region = args.region
    var seed = ee.Number(args.seed || 1)
    var stratum = allocation[0]
    return ee.FeatureCollection.randomPoints({
        region: region,
        points: Number(stratum.sampleSize),
        seed: seed,
        maxError: 1
    }).map(function (sample) {
        return sample
            .set('stratum', stratum.stratum)
            .set('id', ee.String(toId({sample: sample})).cat(':').cat(sample.id()))
            .set('color', stratum.color || '#000000')
    })
}
