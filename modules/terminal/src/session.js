import fs from 'node:fs'
import path from 'node:path'

import pty from 'node-pty'

import {getLogger} from '#sepal/log'

import {homeDir, sshScriptPath} from './config.js'

const log = getLogger('session')

const sessions = {}

const getUsername = req => {
    const sepalUser = req.headers['sepal-user'] && JSON.parse(req.headers['sepal-user'])
    if (sepalUser) {
        const username = sepalUser.username
        if (username) {
            return username
        } else {
            throw Error('Missing username in sepal-user header')
        }
    } else {
        throw Error('Missing sepal-user header in request')
    }
}

const getKeyFile = username => {
    const resolvedHome = path.resolve(homeDir)
    const keyFile = path.resolve(homeDir, username, '.ssh', 'id_rsa')

    if (!keyFile.startsWith(resolvedHome + path.sep)) {
        throw new Error('Invalid username: path traversal detected')
    }

    return keyFile
}

const getTempKeyFile = (username, id) => {
    const tempKeyFile = `/tmp/${username}-${id}.key`
    if (!fs.existsSync(tempKeyFile)) {
        return tempKeyFile
    } else {
        throw Error(`Already existing temporary keyFile: ${tempKeyFile}`)
    }
}

const getTerminal = ({id, username, keyFile, tempKeyFile, cols, rows}) => {
    if (!fs.existsSync(sshScriptPath)) {
        throw Error(`Missing ssh script file: ${sshScriptPath}`)
    }
    
    const terminal = pty.spawn(sshScriptPath, [username, keyFile, tempKeyFile], {
        name: 'xterm-color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: process.env.PWD,
        env: process.env
    })
    log.info(`Created session: ${id}, terminal PID: ${terminal.pid}`)
    return terminal
}

const create = (id, username, req) => {
    const cols = parseInt(req.query.cols)
    const rows = parseInt(req.query.rows)
    const keyFile = getKeyFile(username)
    const tempKeyFile = getTempKeyFile(username, id)
    const terminal = getTerminal({id, username, keyFile, tempKeyFile, cols, rows})

    const session = {
        id,
        username,
        terminal,
        tempKeyFile
    }

    return session
}

const get = req => {
    const id = req.params.sessionId
    const username = getUsername(req)
    if (!sessions[id]) {
        sessions[id] = create(id, username, req)
    } else if (sessions[id].username !== username) {
        throw Error(`Session ${id} does not belong to ${username}`)
    }
    return sessions[id]
}

const find = req => {
    const session = sessions[req.params.sessionId]
    return session?.username === getUsername(req) ? session : undefined
}

const remove = id => {
    if (sessions[id]) {
        delete sessions[id]
        log.info(`Removed session: ${id}`)
    } else {
        log.warn(`Cannot remove session: ${id}`)
    }
}

export {find, get, remove}
