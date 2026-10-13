import {moveDataFolderAside} from '#sepal/dataFolder'
import {getLogger} from '#sepal/log'

import {sendEmail} from './email.js'

const log = getLogger('legacyData')

// The home listing hides data, the Data mount point, so a data folder the user kept from before is moved aside
// first, where they can see it. A failure only leaves it hidden until the next listing.
export const moveLegacyDataAside = async (home, username) => {
    try {
        await moveDataFolderAside({home, username, notify: sendEmail})
    } catch (error) {
        log.warn(`Could not move the data folder of ${username} aside`, error)
    }
}
