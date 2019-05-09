const express = require('express')
const expressWs = require('express-ws')
const pty = require('node-pty')
const {exec} = require('child_process')
const {interval, merge, Subject} = require('rxjs')
const {map, filter, bufferTime} = require('rxjs/operators')

const PORT = process.env.PORT || 3000
const HOST = process.env.IP || '127.0.0.1'
const USERS_HOME = process.env.USERS_HOME || '/sepalUsers'

const Session = (() => {
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

    return {get, remove}
})()

const Terminal = (Session => {
    const start = (websocket, req) => {
        const session = Session.get(req)
        const terminal = session.terminal
        const subscriptions = []
    
        console.log(`Started session: ${session.id}, terminal PID: ${terminal.pid}`)
    
        websocket.on('close', () => {
            terminal.kill()
            exec(`rm -f ${session.key}`)
            subscriptions.forEach(subscription =>
                subscription.unsubscribe()
            )
            console.log(`Closed session: ${session.id}, terminal PID: ${terminal.pid}`)
            Session.remove(session.id)
        })
    
        // upstream (websocket to terminal)
    
        websocket.on('message', msg => 
            terminal.write(msg)
        )
    
        // downstream (terminal to websocket)
        
        const websocket$ = (() => {
            const data$ = new Subject()
    
            const heartbeat$ = interval(3000).pipe(
                map(() => '')
            )
        
            const bufferedData$ = data$.pipe(
                bufferTime(10),
                map(buffered => buffered.join('')),
                filter(data => data)
            )
        
            subscriptions.push(
                merge(heartbeat$, bufferedData$).subscribe(
                    data => {
                        try {
                            websocket.send(data)
                        } catch (e) {}
                    }
                )
            )
        
            return data$
        })()
    
        websocket$.next(session.logs)
        terminal.on('data', data =>
            websocket$.next(data)
        )
    }
    
    const resize = (req, res) => {
        const session = Session.get(req)
        const cols = parseInt(req.query.cols)
        const rows = parseInt(req.query.rows)
        session.terminal.resize(cols, rows)
        console.log(`Resized session: ${session.id}, cols: ${cols}, rows: ${rows}`)
        res.end()
    }

    return {start, resize}
})(Session)

const Server = (Terminal => {
    const app = express()
    expressWs(app)

    app.ws('/:sessionId', Terminal.start)
    app.post('/:sessionId/size', Terminal.resize)

    app.listen(PORT, HOST)
    console.log(`Terminal server listening to http://${HOST}:${PORT}`)
})(Terminal)
