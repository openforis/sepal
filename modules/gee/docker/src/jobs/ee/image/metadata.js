const {job} = require('root/jobs/job')

const worker$ = ({asset, recipe}) => {
    const {of} = require('rx')
    const {switchMap} = require('rx/operators')
    const ImageFactory = require('sepal/ee/imageFactory')
    const ee = require('ee')

    const image$ = asset
        ? of(ee.Image(asset))
        : ImageFactory(recipe).getImage$()
    return image$.pipe(
        switchMap(image => {
            return ee.getInfo$(
                image.toDictionary()
                    .set('bands', image.bandNames()),
                'get image metadata'
            )
        })
    )
}

module.exports = job({
    jobName: 'EE image metadata',
    jobPath: __filename,
    worker$
})
