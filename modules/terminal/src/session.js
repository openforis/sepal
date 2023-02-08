const log = require('#sepal/log').getLogger('session')
const pty = require('node-pty')
const fs = require('fs')

const {homeDir, sshScriptPath} = require('./config')

const sessions = {}

const getUsername = sepalUser => {
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
    const keyFile = `${homeDir}/${username}/.ssh/id_rsa`
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

const create = (id, req) => {
    const cols = parseInt(req.query.cols)
    const rows = parseInt(req.query.rows)
    const sepalUser = JSON.parse(req.headers['sepal-user'])

    const username = getUsername(sepalUser)
    const keyFile = getKeyFile(username)
    const tempKeyFile = getTempKeyFile(username, id)
    const terminal = getTerminal({id, username, keyFile, tempKeyFile, cols, rows})

    const session = {
        id,
        terminal,
        tempKeyFile
    }

    return session
}

const get = req => {
    const id = req.params.sessionId
    if (!sessions[id]) {
        sessions[id] = create(id, req)
    }
    return sessions[id]
}

const remove = id => {
    if (sessions[id]) {
        delete sessions[id]
        log.info(`Removed session: ${id}`)
    } else {
        log.warn(`Cannot remove session: ${id}`)
    }
}

module.exports = {get, remove}
