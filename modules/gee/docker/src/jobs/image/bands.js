const ee = require('@google/earthengine')
const job = require('@sepal/worker/job')

const worker$ = ({recipe}) => {
    const ImageFactory = require('@sepal/ee/imageFactory')
    const {getInfo$} = require('@sepal/ee/utils')
    const {switchMap} = require('rxjs/operators')

    const {getImage$} = ImageFactory(recipe)
    return getImage$().pipe(
        switchMap(image => {
            return getInfo$(image.bandNames())
        })
    )
}

module.exports = job({
    jobName: 'EE geometry',
    jobPath: __filename,
    before: [require('@sepal/ee/initialize')],
    args: ctx => [ctx.request.body],
    worker$
})
