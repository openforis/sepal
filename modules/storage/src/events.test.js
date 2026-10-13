import {firstValueFrom} from 'rxjs'

import {emitUserStorageErased, STORAGE_PUBLISHERS} from './events.js'

it('publishes a purged user as storage.UserStorageErased', async () => {
    const {publish$} = STORAGE_PUBLISHERS.find(({key}) => key === 'storage.UserStorageErased')
    const published = firstValueFrom(publish$)

    emitUserStorageErased('alice')

    expect(await published).toEqual({username: 'alice'})
})
