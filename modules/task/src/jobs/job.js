const Job = require('#sepal/worker/job')

module.exports = {
    job: config =>
        Job()({
            ...config,
            schedulerName: 'GoogleEarthEngine'
        })
}
