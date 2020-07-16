const {job} = require('root/jobs/job')

const worker$ = ({recipe}) => {
    const ImageFactory = require('sepal/ee/imageFactory')
    const ee = require('ee')
    const {switchMap} = require('rx/operators')

    const {getImage$} = ImageFactory(recipe)
    return getImage$().pipe(
        switchMap(image =>
            ee.getInfo$(image.bandNames(), 'band names').pipe(
                tap(bandNames => log.warn('bandNames', bandNames))
            ))
    )
}

module.exports = job({
    jobName: 'EE image bands',
    jobPath: __filename,
    worker$
})
