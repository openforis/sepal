import Job from '#sepal/worker/job'

export const job = config =>
    Job({
        ...config,
        schedulerName: 'GoogleEarthEngine'
    })
