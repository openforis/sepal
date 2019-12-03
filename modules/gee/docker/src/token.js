const {of} = require('rxjs')
const {finalize, switchMap, tap} = require('rxjs/operators')
const service = require('@sepal/worker/service')

const releaseToken = token => {
    console.log('released token ' + token)
}

const getToken$ = namespace => {
    console.log('getToken$')
    const token$ = service('token').request$({namespace})
    return token$.pipe(
        tap(token => console.log('********** GOT A TOKEN ', token)),
        switchMap(token => of(token).pipe(
            finalize(() => releaseToken(token))
        ))
    )
}
module.exports = getToken$
