const {job} = require('#gee/jobs/job')

const worker$ = ({
    requestArgs: {asset, recipe}
}) => {
    const ImageFactory = require('#sepal/ee/imageFactory')
    const ee = require('#sepal/ee/ee')
    const {switchMap} = require('rxjs')

    if (asset) {
        return assetBands$()
    } else {
        return recipeBands$()
    }

    function assetBands$() {
        return ImageFactory({type: 'ASSET', id: asset}).getImage$().pipe(
            switchMap(image => ee.getInfo$(image.bandNames(), 'asset band names'))
        )
    }

    function recipeBands$() {
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
