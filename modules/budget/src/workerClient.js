import {config} from './config.js'

const sepalUserHeader = username => JSON.stringify({username, roles: ['application_admin'], systemUser: true})

export const createWorkerClient = ({
    workerUrl = config.workerUrl,
    sepalUser = config.sepalUser,
    fetch = globalThis.fetch
} = {}) => {
    const openSessions = async () => {
        const res = await fetch(`${workerUrl}/sessions/open`, {
            headers: {'sepal-user': sepalUserHeader(sepalUser)}
        })
        if (!res.ok)
            throw new Error(`worker /sessions/open -> ${res.status}`)
        return res.json()
    }
    return {openSessions}
}
