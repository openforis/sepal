const job = require('root/jobs/job')

const worker$ = () => {

    const ee = require('ee')
    const {map} = require('rxjs/operators')

    return ee.getInfo$(ee.Image()).pipe(
        map(() => ({'status': 'OK'}))
    )
}

module.exports = job({
    jobName: 'EE check',
    jobPath: __filename,
    before: [require('root/jobs/ee/initialize')],
    args: ctx => [ctx.request.body],
    worker$
})
