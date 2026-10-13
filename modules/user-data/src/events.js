import {Subject} from 'rxjs'

const userDataSize$ = new Subject()

export const USER_DATA_PUBLISHERS = [
    {key: 'userData.size', publish$: userDataSize$}
]

export const emitUserDataSize = (username, size) => userDataSize$.next({username, size})
