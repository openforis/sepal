import {concat, switchMap, throwError} from 'rxjs'

import {ClientException} from '#sepal/exception'
import {nonRepairableStrata, repairOffset, underproducingStrata, underproductionDetails, underproductionUserMessage} from '#sepal/ee/samplingDesign/systematicRepair'
import {swallow} from '#sepal/rxjs'

// Underproduction is a user/design constraint (too many samples requested for the available area at the
// minimum distance), not an internal fault - a ClientException carrying a structured userMessage, so the
// task status shows the localized guidance without a technical exception prefix.
const underproductionError = ({summary, strata, reason}) => {
    const userMessage = underproductionUserMessage({details: underproductionDetails({summary, strata}), reason})
    const resolved = userMessage.message.replace('{strata}', userMessage.args.strata)
    return new ClientException(resolved, {userMessage})
}

// Base + at-most-one-repair + final export orchestration for systematic sampling. Materialize a
// conservative base candidate set, count it over the materialized asset, and only if some strata
// underproduce, materialize one denser repair set for just those strata (a single repair, no loop). The
// final export uses repair candidates for repaired strata and base candidates for the rest. EXACT/OVER fail
// clearly if a stratum can't reach the requested count and can't be densified further; CLOSEST proceeds with
// the best available. All EE effects are injected so the flow is testable without EE:
//   exportUnfiltered$({assetId, densityOffset, allocation}) -> Observable (materialize candidates)
//   count$({assetId, allocation}) -> Observable<{raw, actual, levels}> (getInfo over the materialized asset)
//   candidatesOf({baseAssetId, repairAssetId, repairedStrata}) -> EE candidates for the final filter/export
//   finalExport$({candidates, densityOffset}) -> Observable (filter + export)
export const systematicExportPlan$ = ({
    allocation, baseOffset, maxOffsetOf, requireFull, baseAssetId, repairAssetId,
    exportUnfiltered$, count$, candidatesOf, finalExport$
}) => {
    const materializeAndCount$ = ({assetId, densityOffset, strata}) =>
        concat(
            exportUnfiltered$({assetId, densityOffset, allocation: strata}).pipe(swallow()),
            count$({assetId, allocation: strata})
        )

    return materializeAndCount$({assetId: baseAssetId, densityOffset: baseOffset, strata: allocation}).pipe(
        switchMap(summary => {
            const underproducing = underproducingStrata({summary, allocation})
            if (!underproducing.length) {
                return finalExport$({candidates: candidatesOf({baseAssetId}), densityOffset: baseOffset})
            }
            // requireFull (EXACT/OVER): if ANY failing stratum is already at its minimum-distance limit, no
            // repair can make the requested counts reachable - fail now rather than spend a repair export
            // that's guaranteed to leave that stratum short (which would also mislabel the failure as
            // "after one denser repair export").
            if (requireFull) {
                const nonRepairable = nonRepairableStrata({underproducing, baseOffset, maxOffsetOf})
                if (nonRepairable.length) {
                    return throwError(() => underproductionError({summary, strata: nonRepairable, reason: 'minDistanceLimit'}))
                }
            }
            const offset = repairOffset({underproducing, summary, baseOffset, maxOffsetOf})
            if (offset <= baseOffset) {
                // No failing stratum can be densified past its own minimum-distance limit (CLOSEST reaches
                // here; requireFull was already handled above): CLOSEST uses the best available base
                // candidates, and the requireFull branch is a defensive fallback.
                return requireFull
                    ? throwError(() => underproductionError({summary, strata: underproducing, reason: 'minDistanceLimit'}))
                    : finalExport$({candidates: candidatesOf({baseAssetId}), densityOffset: baseOffset})
            }
            return materializeAndCount$({assetId: repairAssetId, densityOffset: offset, strata: underproducing}).pipe(
                switchMap(repairSummary => {
                    const stillShort = underproducingStrata({summary: repairSummary, allocation: underproducing})
                    if (requireFull && stillShort.length) {
                        return throwError(() => underproductionError({summary: repairSummary, strata: stillShort, reason: 'repairExhausted'}))
                    }
                    return finalExport$({
                        candidates: candidatesOf({baseAssetId, repairAssetId, repairedStrata: underproducing}),
                        densityOffset: baseOffset
                    })
                })
            )
        })
    )
}
