const {interval} = require('rxjs')
const {map, take, tap} = require('rxjs/operators')

module.exports = {
    submit$: (id, params) =>
        interval(100).pipe(
            map(i => ({
               message: 'SOME MESSAGE ' + i
            })),
            tap(m => console.log('Working: ', m)),
            take(100)
        )
}
