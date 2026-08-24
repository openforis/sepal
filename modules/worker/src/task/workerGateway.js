// WorkerGateway — outbound HTTP client the task orchestrator uses to send tasks to (and cancel
// tasks on) the task-executor running in the sandbox container.
//
// createWorkerGateway({sepalUsername, sepalPassword, workerPort = 8080}) → {execute, cancel}:
//   execute → POST   http://{session.host}:{workerPort}/api/tasks   (form-encoded body)
//   cancel  → DELETE http://{session.host}:{workerPort}/api/tasks/{taskId}
//
// task.params is sent AS-IS: the orchestrator serializes it to a JSON string before calling
// execute, and this gateway does NOT re-serialize it.
//
// Auth is HTTP Basic with the sepalAdmin credentials.

import {getLogger} from '#sepal/log'

import {taskTag} from '../tag.js'

const log = getLogger('worker/workerGateway')

const DEFAULT_SEPAL_USERNAME = 'sepalAdmin'
const DEFAULT_WORKER_PORT = 8080

const createWorkerGateway = ({sepalUsername = DEFAULT_SEPAL_USERNAME, sepalPassword, workerPort = DEFAULT_WORKER_PORT}) => {
    const authorization = 'Basic ' + Buffer.from(`${sepalUsername}:${sepalPassword}`).toString('base64')

    const baseUrl = session => `http://${session.host}:${workerPort}/api`

    const execute = async (task, session) => {
        const url = `${baseUrl(session)}/tasks`
        log.debug(() => `Executing ${taskTag(task.id)} at ${url}`)
        // Build a form body, omitting null/undefined fields so a task with no recipeId doesn't send
        // the literal string "null".
        const body = new URLSearchParams()
        const append = (key, value) => {
            if (value !== null && value !== undefined) {
                body.append(key, value)
            }
        }
        append('id', task.id)
        append('recipeId', task.recipeId)
        append('operation', task.operation)
        append('params', task.params)
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': authorization,
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        })
        if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`Failed to execute task ${task.id}: ${response.status} ${text}`)
        }
    }

    const cancel = async (taskId, session) => {
        const url = `${baseUrl(session)}/tasks/${taskId}`
        log.debug(() => `Canceling task at ${url}`)
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Authorization': authorization,
                'Accept': 'application/json',
            },
        })
        if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`Failed to cancel task ${taskId}: ${response.status} ${text}`)
        }
    }

    return {execute, cancel}
}

export {createWorkerGateway}
