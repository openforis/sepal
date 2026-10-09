import logConfig from '#config/log.json' with {type: 'json'}
import {configureServer, getLogger} from '#sepal/log'

import {operations} from './runner/operations.js'
import {ProgressReporter} from './runner/progressReporter.js'
import {runTask} from './runner/runTask.js'
import {SepalClient} from './runner/sepalClient.js'
import {readTask, writeResult} from './runner/taskFiles.js'

configureServer(logConfig)

const log = getLogger('run')

const TASK_DIR = '/task'
const HEARTBEAT_MS = 60 * 1000

const main = async () => {
    const task = await readTask(TASK_DIR)
    log.info(`${task.operation} started`)
    const sepal = new SepalClient({endpoint: process.env.SEPAL_ENDPOINT, apiKey: process.env.TASK_API_KEY})
    const reporter = new ProgressReporter({send: statusDescription => sepal.reportProgress(task.id, statusDescription)})
    const abort = new AbortController()
    process.once('SIGTERM', () => {
        log.info('Stop requested')
        abort.abort()
    })
    const heartbeat = setInterval(() => reporter.heartbeat(), HEARTBEAT_MS)
    const result = await runTask({task, operations, sepal, report: description => reporter.report(description), signal: abort.signal})
    clearInterval(heartbeat)
    await writeResult(TASK_DIR, result)
    log.info(`Task ${result.state.toLowerCase()}`)
}

main().then(
    () => process.exit(0),
    error => {
        log.fatal(error)
        process.exit(1)
    }
)
