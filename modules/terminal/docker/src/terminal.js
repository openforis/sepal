const express = require('express')
const expressWs = require('express-ws')
const pty = require('node-pty')

const {exec} = require('child_process')

const {interval, Subject} = require('rxjs')
const {map, filter, bufferTime} = require('rxjs/operators')

const terminals = {}
const subscriptions = []
const logs = {}

const connect = (req, res) => {
    const cols = parseInt(req.query.cols)
    const rows = parseInt(req.query.rows)
    const username = JSON.parse(req.headers['sepal-user']).username
    const usersHome = process.env.USERS_HOME || '/sepalUsers'
    const keyFile = `${usersHome}/${username}/.ssh/id_rsa`
    const sshGateway = process.env.SSH_GATEWAY_HOST

    const key = `/tmp/${username}.key`
    exec(`sudo cp ${keyFile} ${key}`)
    exec(`sudo chown node:node ${key}`)
    const term = pty.spawn('ssh', ['-q', '-o', 'StrictHostKeyChecking=no', '-i', key, `${username}@${sshGateway}`], {
        uid: process.getuid(),
        gid: process.getgid(),
        name: 'xterm-color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: process.env.PWD,
        env: process.env
    })

    console.log('Created terminal with PID: ' + term.pid)
    terminals[term.pid] = {
        term,
        key
    }
    logs[term.pid] = ''
    term.on('data', data => logs[term.pid] += data)
    res.send(term.pid.toString())
    res.end()
}

const resize = (req, res) => {
    const pid = parseInt(req.params.pid)
    const cols = parseInt(req.query.cols)
    const rows = parseInt(req.query.rows)
    const term = terminals[pid].term

    term.resize(cols, rows)
    console.log('Resized terminal ' + pid + ' to ' + cols + ' cols and ' + rows + ' rows.')
    res.end()
}

const terminal = (ws, req) => {
    var term = terminals[parseInt(req.params.pid)].term
    console.log('Connected to terminal ' + term.pid)

    const webSocketSend = data => {
        try {
            ws.send(data)
        } catch (ex) {}
    }

    webSocketSend(logs[term.pid])
    
    const downStream$ = new Subject()
    subscriptions.push(
        downStream$
            .pipe(
                bufferTime(10),
                map(buffered => buffered.join('')),
                filter(data => data)
            )
            .subscribe(
                data => webSocketSend(data)
            )
    )

    subscriptions.push(
        interval(3000)
            .subscribe(() => webSocketSend(''))
    )

    term.on('data', data => downStream$.next(data))

    ws.on('message', msg => term.write(msg))

    ws.on('close', () => {
        term.kill()
        exec(`rm -f ${terminals[term.pid].key}`)
        
        subscriptions.forEach(subscription => subscription.unsubscribe())
        console.log('Closed terminal ' + term.pid)
        delete terminals[term.pid]
        delete logs[term.pid]
    })
}

const startServer = () => {

    const app = express()
    expressWs(app)

    app.post('/', connect)
    app.post('/:pid/size', resize)
    app.ws('/:pid', terminal)

    const port = process.env.PORT || 3000
    const host = process.env.IP || '127.0.0.1'

    console.log('App listening to http://' + host + ':' + port)
    app.listen(port, host)
}

startServer()
