const {job} = require('#gee/jobs/job')

const worker$ = () => {
    const ee = require('#sepal/ee')
    const {map} = require('rxjs')

    return ee.getInfo$(ee.Image(), 'can communicate with EE servers').pipe(
        map(() => ({'status': 'OK'}))
    )
}

module.exports = job({
    jobName: 'EE check',
    jobPath: __filename,
    worker$
})
