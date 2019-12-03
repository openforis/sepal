const {of} = require('rxjs')

const handle$ = (requestId, {namespace}) => {
    return of({token: requestId})
}

module.exports = {handle$}
