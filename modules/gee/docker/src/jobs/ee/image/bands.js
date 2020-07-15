const job = require('root/jobs/job')

const worker$ = ({recipe}) => {
    const ImageFactory = require('sepal/ee/imageFactory')
    const ee = require('ee')
    const {switchMap, tap} = require('rx/operators')
    const log = require('sepal/log').getLogger('temp')

    const {getImage$} = ImageFactory(recipe)
    return getImage$().pipe(
        switchMap(image =>
            ee.getInfo$(image.bandNames(), 'band names')
        )
    )
}

module.exports = job({
    jobName: 'Bands',
    jobPath: __filename,
    before: [require('root/jobs/ee/initialize')],
    args: ctx => [ctx.request.body],
    worker$
})
