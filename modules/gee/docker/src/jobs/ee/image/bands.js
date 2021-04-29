const {job} = require('root/jobs/job')

const worker$ = ({asset, recipe}) => {
    const ImageFactory = require('sepal/ee/imageFactory')
    const ee = require('ee')
    if (asset) {
        return assetBands()
    } else {
        return recipeBands()
    }

    function assetBands() {
        return ee.getInfo$(ee.Image(asset).bandNames(), 'asset band names')
    }

    function recipeBands() {
        const {getBands$} = ImageFactory(recipe)
        return getBands$()
    }
}

module.exports = job({
    jobName: 'EE image bands',
    jobPath: __filename,
    worker$
})
