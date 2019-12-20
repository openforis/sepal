const {interval} = require('rxjs')
const {map, take} = require('rxjs/operators')

module.exports = {
    submit$: (id, params) =>
        interval(1000).pipe(
            map(i => ({
               message: 'SOME MESSAGE ' + i
            })),
            take(3)
        )
}
