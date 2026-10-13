import {Subject} from 'rxjs'

const userStorageErased$ = new Subject()

export const STORAGE_PUBLISHERS = [
    {key: 'storage.UserStorageErased', publish$: userStorageErased$}
]

export const emitUserStorageErased = username => userStorageErased$.next({username})
