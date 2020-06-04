const job = require('root/jobs/job')

const worker$ = (taskDef, description) => {
    const ee = require('ee')
    const ImageFactory = require('sepal/ee/imageFactory')
    const {map, switchMap} = require('rxjs/operators')

    const getImage$ = ({recipe, bands}) =>
        ImageFactory(recipe, bands).getImage$()

    const getTask$ = ({imageDef, method, args}) =>
        getImage$(imageDef).pipe(
            map(image =>
                ee.batch.Export.image[method](image, ...args)
            )
        )

    const startTask$ = task =>
        ee.$({
            operation: `start task (${description})`,
            ee: (resolve, reject) =>
                ee.data.startProcessing(null, task.config_, (result, error) =>
                    error
                        ? reject(error)
                        : resolve(result.taskId)
                )
        })

    return getTask$(taskDef).pipe(
        switchMap(task => startTask$(task))
    )
}

module.exports = job({
    jobName: 'Start task',
    jobPath: __filename,
    before: [require('root/jobs/ee/initialize')],
    args: ({taskDef, description}) => [taskDef, description],
    worker$
})
