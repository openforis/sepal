const {exec} = require('child_process')
const {interval, merge, Subject} = require('rxjs')
const {map, filter, bufferTime} = require('rxjs/operators')

const Session = require('./session')

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

module.exports = {start, resize}
