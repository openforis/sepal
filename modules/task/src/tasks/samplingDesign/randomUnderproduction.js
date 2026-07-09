import {map} from 'rxjs'

import {randomUnderproductionUserMessage, shortfallDetails} from '#sepal/ee/samplingDesign/underproduction'
import {ClientException} from '#sepal/exception'

// A random shortfall is a user/design constraint (too many samples requested for the available area at the
// minimum distance), not an internal fault - a ClientException carrying a structured userMessage so the task
// status shows actionable guidance without a technical prefix.
const randomUnderproductionError = ({details, hasMinDistance}) => {
    const userMessage = randomUnderproductionUserMessage({details, hasMinDistance})
    const resolved = userMessage.message.replace('{strata}', userMessage.args.strata)
    return new ClientException(resolved, {userMessage})
}

// rxjs operator over SUCCESSFULLY-computed per-stratum counts: passes them through when every stratum met
// its requested size, or throws a structured random-underproduction ClientException when some fell short.
// It only runs on emitted counts, so an upstream EE/getInfo failure propagates unchanged as its own (EE)
// error - a genuine known shortfall is never confused with an unrelated failure.
export const validateRandomCounts = ({allocation, hasMinDistance}) =>
    map(counts => {
        const details = shortfallDetails({counts, allocation})
        if (details.length) {
            throw randomUnderproductionError({details, hasMinDistance})
        }
        return counts
    })
