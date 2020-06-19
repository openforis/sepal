require('sepal/log').configureServer(require('./log.json'))
const config = require('./config')
require('./context').setConfig(config)
const server = require('sepal/httpServer')
const routes = require('./routes')
const {initializeEE$} = require('./ee/initialize')

initializeEE$().subscribe(
    () => server.start({
        port: config.port,
        routes
    })
)

// const {concat, interval, of} = require('rx')
// const {finalize, tap, take} = require('rx/operators')
//
// concat(
//     interval(1000).pipe(
//         tap(i => console.log(i)),
//         finalize(() => console.log('FINALIZE')),
//         take(2),
//     ),
//     of('ANOTHER')
// ).subscribe(
//     next => console.log('NEXT', next),
//     error => console.log('ERROR', error),
//     () => console.log('COMPLETE'),
// )
