import {map, switchMap} from 'rxjs'

import {classifyFinalCounts, groupFinalCountFailures} from '#sepal/ee/samplingDesign/finalCountValidation'
import {underproductionUserMessage} from '#sepal/ee/samplingDesign/underproductionAdvice'
import {ClientException} from '#sepal/exception'

// Classify the counted FINAL collection against the minimum-sample contract, returning a structured
// ClientException whose advice is derived from the submitted configuration - or null when every stratum is
// valid. `config` carries the resolved recipe facts the advice needs (arrangement/sample-size/allocation
// strategy, effective minimum, minDistance, grid pixel size, stratified vs unstratified).
export const finalCountError = ({counts, allocation, config}) => {
    const failures = classifyFinalCounts({
        counts,
        allocation,
        effectiveMinimum: config.effectiveMinimum,
        arrangementStrategy: config.arrangementStrategy,
        sampleSizeStrategy: config.sampleSizeStrategy
    })
    if (!failures.length) {
        return null
    }
    const userMessage = underproductionUserMessage({groups: groupFinalCountFailures(failures), config})
    return new ClientException(userMessage.message.replace('{details}', userMessage.args.details), {userMessage})
}

// Gate the final export on that validation: the check runs on counts$ first and export$ is only subscribed when
// every stratum satisfies its contract, so a failing design never starts an export.
export const gateFinalExport$ = ({counts$, allocation, config, export$}) =>
    counts$.pipe(
        map(counts => {
            const error = finalCountError({counts, allocation, config})
            if (error) {
                throw error
            }
            return counts
        }),
        switchMap(() => export$)
    )
