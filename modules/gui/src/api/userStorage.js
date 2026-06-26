import {get$} from '~/http-client'

export default {
    getMostRecentEvents$: () =>
        get$('/api/user-storage/mostRecentEvents'),

    getUserEvents$: username =>
        get$('/api/user-storage/userEvents', {
            query: {
                username
            }
        }),
}
