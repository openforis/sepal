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
        const {switchMap} = require('rx/operators')

        const {getImage$} = ImageFactory(recipe)
        return getImage$().pipe(
            switchMap(image =>
                ee.getInfo$(image.bandNames(), 'recipe band names')
            )
        )
    }
}

module.exports = job({
    jobName: 'EE image bands',
    jobPath: __filename,
    worker$
})
