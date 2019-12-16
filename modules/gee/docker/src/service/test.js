const {tap, delay} = require('rxjs/operators')
const log = require('../log')
const token = require('./token')

token.handle$('123').pipe(
    tap(token => log.debug('Do something with token', token)),
    delay(3000),
    tap(token => log.debug('Finished with token', token)),
).subscribe(
    // log.errors
)
