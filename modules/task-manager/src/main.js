import Docker from 'dockerode'

import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'

import {config, TASK_DIR} from './config.js'
import {containerSpec} from './containerSpec.js'
import {ContainerSupervisor} from './containerSupervisor.js'
import {initializeDb} from './db.js'
import {DockerEngine} from './dockerEngine.js'
import {emitTaskChanged} from './events.js'
import {createRoutes} from './routes.js'
import {TaskRepository} from './taskRepository.js'
import {Tasks} from './tasks.js'
import {createTasksApi} from './tasksApi.js'
import {TaskWorkspace} from './taskWorkspace.js'
import {createTaskWs} from './ws.js'

configureServer(logConfig)

const log = getLogger('main')

const clock = () => new Date()

const main = async () => {
    const db = await initializeDb()
    const repository = new TaskRepository(db, {clock, onChange: emitTaskChanged})
    const supervisor = new ContainerSupervisor({
        repository,
        docker: new DockerEngine(new Docker()),
        workspace: new TaskWorkspace({dir: TASK_DIR}),
        spec: ({task, apiKey}) => containerSpec({task, apiKey, config}),
        config: {
            maxConcurrent: config.taskMaxConcurrent,
            maxConcurrentLocal: config.taskMaxConcurrentLocal,
            stallTimeoutMs: 15 * 60 * 1000,
            cancelTimeoutMs: 5 * 60 * 1000,
            stopGraceSeconds: 120,
            clock
        }
    })
    const tasks = new Tasks({repository, supervisor, clock})
    const taskWs$ = createTaskWs({tasks})
    await server.start({
        port: config.port,
        routes: createRoutes(createTasksApi(tasks)),
        wsRoutes: {'/ws': server.wsStream(ctx => taskWs$(ctx.arg$))}
    })
    await supervisor.start()
    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
