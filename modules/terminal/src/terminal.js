const log = require('#sepal/log').getLogger('terminal')
const {exec} = require('child_process')
const {interval, merge, Subject, map, filter, bufferTime} = require('rxjs')

const Session = require('./session')

const start = (websocket, req) => {
    try {
        const session = Session.get(req)
        const terminal = session.terminal
        const subscriptions = []
    
        log.info(`Started session: ${session.id}, terminal PID: ${terminal.pid}`)
    
        websocket.on('close', () => {
            terminal.kill()
            exec(`rm -f ${session.tempKeyFile}`)
            subscriptions.forEach(subscription =>
                subscription.unsubscribe()
            )
            log.info(`Closed session: ${session.id}, terminal PID: ${terminal.pid}`)
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
                        } catch (e) {
                            log.error('Cannot write to websocket', e)
                        }
                    }
                )
            )
        
            return data$
        })()
    
        terminal.on('data', data =>
            websocket$.next(data)
        )
    } catch(error) {
        log.error('Cannot start session', error)
    }
}

const resize = (req, res) => {
    try {
        const session = Session.get(req)
        const cols = parseInt(req.query.cols)
        const rows = parseInt(req.query.rows)
        session.terminal.resize(cols, rows)
        log.info(`Resized session: ${session.id}, cols: ${cols}, rows: ${rows}`)
        res.end()
    } catch (error) {
        log.error('Cannot resize session', error)
    }
}

module.exports = {start, resize}
