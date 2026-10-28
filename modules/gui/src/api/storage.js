import {get$} from '~/http-client'

export default {
    getMostRecentEvents$: () =>
        get$('/api/storage/mostRecentEvents'),

    getUserEvents$: username =>
        get$('/api/storage/userEvents', {
            query: {
                username
            }
        }),
}
