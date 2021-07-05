const log = require('sepal/log').getLogger('session')
const pty = require('node-pty')

const {homeDir, sshScriptPath} = require('./config')

const sessions = {}

const create = (id, req) => {
    const cols = parseInt(req.query.cols)
    const rows = parseInt(req.query.rows)
    const username = JSON.parse(req.headers['sepal-user']).username
    const keyFile = `${homeDir}/${username}/.ssh/id_rsa`
    const key = `/tmp/${username}-${id}.key`
    const terminal = pty.spawn(sshScriptPath, [username, keyFile, key], {
        name: 'xterm-color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: process.env.PWD,
        env: process.env
    })

    log.info(`Created session: ${id}, terminal PID: ${terminal.pid}`)

    const session = {
        id,
        terminal,
        key,
        logs: ''
    }

    terminal.on('data', data =>
        session.logs += data
    )

    sessions[id] = session
}

const get = req => {
    const id = req.params.sessionId
    if (!sessions[id]) {
        create(id, req)
    }
    return sessions[id]
}

const remove = id => {
    delete sessions[id]
    log.info(`Removed session: ${id}`)
}

module.exports = {get, remove}
