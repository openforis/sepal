const job = require('root/jobs/job')

const worker$ = (taskDef, description) => {
    const ee = require('ee')
    const ImageFactory = require('sepal/ee/imageFactory')
    const {map, switchMap} = require('rxjs/operators')
    const runTask$ = require('../../../ee/task')

    const getImage$ = ({recipe, bands}) =>
        ImageFactory(recipe, bands).getImage$()

    const createTask$ = ({imageDef, method, args}) =>
        getImage$(imageDef).pipe(
            map(image =>
                ee.batch.Export.image[method](image, ...args)
            )
        )

    return createTask$(taskDef).pipe(
        switchMap(task => runTask$(task, description))
    )
}

module.exports = job({
    jobName: 'Run task',
    jobPath: __filename,
    before: [require('root/jobs/ee/initialize')],
    args: ({taskDef, description}) => [taskDef, description],
    worker$
})
