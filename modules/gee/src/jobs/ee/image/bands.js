const {job} = require('gee/jobs/job')

const worker$ = ({asset, recipe}) => {
    const ImageFactory = require('sepal/ee/imageFactory')
    const ee = require('sepal/ee')
    const {switchMap} = require('rxjs')

    if (asset) {
        return assetBands()
    } else {
        return recipeBands()
    }

    function assetBands() {
        return ee.getInfo$(ee.Image(asset).bandNames(), 'asset band names')
    }

    function recipeBands() {
        const {getBands$, getImage$} = ImageFactory(recipe)
        return getBands$
            ? getBands$()
            : getImage$().pipe(
                switchMap(image => ee.getInfo$(image.bandNames(), 'image band names'))
            )
    }
}

module.exports = job({
    jobName: 'EE image bands',
    jobPath: __filename,
    worker$
})
