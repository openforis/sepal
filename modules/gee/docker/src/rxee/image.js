const {first, tap} = require('rxjs/operators')
const {from, Subject} = require('rxjs')

const getMap$ = (image, visParams) =>
    // fromCallback$(result$ =>
    //     image.getMap(visParams, (map, error) =>
    //         error
    //             ? result$.error(error)
    //             : result$.next({
    //                 mapId: map.mapid,
    //                 token: map.token
    //             })
    //     )
    // ).pipe(tap(console.log))
    from(
        new Promise((resolve, reject) => {
            image.getMap(visParams, (map, error) =>
                error
                    ? reject(error)
                    : resolve({
                        mapId: map.mapid,
                        token: map.token
                    })
            )
        })
    )

const fromCallback = (resolve, reject) => {
    from(new Promise((resolve, reject) => callback))
}

// const fromCallback$ = callback => {
//     const result$ = new Subject()
//     callback(result$)
//     return result$.pipe(tap(value => console.log('got a value')))
// }
//
module.exports = {getMap$}
//
// class Completable extends Subject {
//     // noinspection JSCheckFunctionSignatures
//     complete(value) {
//         // if (value !== undefined) {
//         //     this.next(value)
//         // }
//         console.log('next', value)
//         this.next(value)
//         // super.complete()
//     }
// }
