const job = require('root/jobs/job')

const worker$ = ({recipe}) => {
    const ImageFactory = require('sepal/ee/imageFactory')
    const ee = require('ee')
    const {switchMap} = require('rxjs/operators')

    const {getImage$} = ImageFactory(recipe)
    return getImage$().pipe(
        switchMap(image => {
            return ee.getInfo$(image.bandNames())
        })
    )
}

module.exports = job({
    jobName: 'EE geometry',
    jobPath: __filename,
    before: [require('root/jobs/ee/initialize')],
    args: ctx => [ctx.request.body],
    worker$
})
