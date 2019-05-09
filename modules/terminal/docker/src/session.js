const pty = require('node-pty')

const {USERS_HOME} = require('./config')

const sessions = {}

const create = (id, req) => {
    const cols = parseInt(req.query.cols)
    const rows = parseInt(req.query.rows)
    const username = JSON.parse(req.headers['sepal-user']).username
    const keyFile = `${USERS_HOME}/${username}/.ssh/id_rsa`
    const key = `/tmp/${username}-${id}.key`
    const terminal = pty.spawn('ssh_gateway.sh', [username, keyFile, key], {
        name: 'xterm-color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: process.env.PWD,
        env: process.env
    })

    console.log(`Created session: ${id}, terminal PID: ${terminal.pid}`)

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
    console.log(`Removed session: ${id}`)
}

module.exports = {get, remove}
