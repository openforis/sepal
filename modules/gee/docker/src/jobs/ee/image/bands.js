const job = require('root/jobs/job')

const worker$ = ({recipe}) => {
    const ImageFactory = require('root/ee/imageFactory')
    const {getInfo$} = require('root/ee/utils')
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
    before: [require('root/jobs/ee/initialize')],
    args: ctx => [ctx.request.body],
    worker$
})
