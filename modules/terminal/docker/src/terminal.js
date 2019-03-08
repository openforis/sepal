const express = require('express')
const expressWs = require('express-ws')
const pty = require('node-pty')

const {Subject} = require('rxjs')
const {map, filter, bufferTime} = require('rxjs/operators')

const terminals = {}
const logs = {}

const connect = (req, res) => {
    // console.log(req.headers)
    const cols = parseInt(req.query.cols)
    const rows = parseInt(req.query.rows)
    const username = JSON.parse(req.headers['sepal-user']).username
    const keyFile = `/sepalUsers/${username}/.ssh/id_rsa`
    const sshGateway = process.env.SSH_GATEWAY_HOST
    const term = pty.spawn('ssh', ['-q', '-o', 'StrictHostKeyChecking=no', '-i', keyFile, `${username}@${sshGateway}`], {
        name: 'xterm-color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: process.env.PWD,
        env: process.env
    })

    console.log('Created terminal with PID: ' + term.pid)
    terminals[term.pid] = term
    logs[term.pid] = ''
    term.on('data', data => logs[term.pid] += data)
    res.send(term.pid.toString())
    res.end()
}

const resize = (req, res) => {
    const pid = parseInt(req.params.pid)
    const cols = parseInt(req.query.cols)
    const rows = parseInt(req.query.rows)
    const term = terminals[pid]

    term.resize(cols, rows)
    console.log('Resized terminal ' + pid + ' to ' + cols + ' cols and ' + rows + ' rows.')
    res.end()
}

const terminal = (ws, req) => {
    var term = terminals[parseInt(req.params.pid)]
    console.log('Connected to terminal ' + term.pid)
    try {
        ws.send(logs[term.pid])
    } catch (ex) {}

    const downStream$ = new Subject()
    const subscription = downStream$
        .pipe(
            bufferTime(10),
            map(buffered => buffered.join('')),
            filter(data => data)
        )
        .subscribe(
            data => {
                try {
                    ws.send(data)
                } catch (ex) {}
            }
        )

    term.on('data', data => downStream$.next(data))

    ws.on('message', msg => term.write(msg))
    
    ws.on('close', () => {
        term.kill()
        subscription.unsubscribe()
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
