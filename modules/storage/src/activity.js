import {firstValueFrom} from 'rxjs'

import {inactivityTimeout} from './config.js'
import {getMostRecentAccess$} from './http.js'

export const isActive = async username => {
    const mostRecentAccess = await firstValueFrom(getMostRecentAccess$(username))
    return !!mostRecentAccess && relativeExpirationTime(mostRecentAccess) > 0
}

// positive: future, negative: past
export const relativeExpirationTime = mostRecentTimestamp =>
    mostRecentTimestamp.getTime() + inactivityTimeout - Date.now()
