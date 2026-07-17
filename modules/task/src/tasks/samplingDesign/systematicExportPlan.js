import {concat, of, switchMap, throwError} from 'rxjs'

import {nonRepairableStrata, repairOffset, underproducingStrata} from '#sepal/ee/samplingDesign/systematicRepair'
import {progress} from '#task/rxjs/operators'

// Stage-level task progress for the systematic base + optional-repair + final flow. Emitted so the task
// status shows meaningful steps instead of a silent "Executing..." (the temp candidate exports' own EE
// progress is also passed through - see below). Sampling-Design-specific text lives here, not in the
// generic table-export helpers.
const PROGRESS = {
    prepareBase: {messageKey: 'tasks.samplingDesign.systematic.progress.prepareBaseCandidates', defaultMessage: 'Preparing sample candidates'},
    checkBase: {messageKey: 'tasks.samplingDesign.systematic.progress.checkBaseCandidates', defaultMessage: 'Checking sample candidates'},
    prepareRepair: {messageKey: 'tasks.samplingDesign.systematic.progress.prepareRepairCandidates', defaultMessage: 'Preparing additional sample candidates'},
    checkRepair: {messageKey: 'tasks.samplingDesign.systematic.progress.checkRepairCandidates', defaultMessage: 'Checking additional sample candidates'},
    exportFinal: {messageKey: 'tasks.samplingDesign.systematic.progress.exportFinal', defaultMessage: 'Exporting final sample design'}
}

const stage$ = descriptor => of(undefined).pipe(progress(descriptor))

// Base + at-most-one-repair + final export orchestration for systematic sampling. Materialize a
// conservative base candidate set, count it over the materialized asset, and only if some strata
// underproduce, materialize one denser repair set for just those strata (a single repair, no loop). The
// final export uses repair candidates for repaired strata and base candidates for the rest. EXACT/OVER fail
// clearly if a stratum can't reach the requested count and can't be densified further; CLOSEST proceeds with
// the best available. All EE effects are injected so the flow is testable without EE:
//   exportUnfiltered$({assetId, densityOffset, allocation}) -> Observable (materialize candidates; its EE
//       progress is passed through, not swallowed)
//   count$({assetId, allocation, densityOffset}) -> Observable<{raw, actual, levels}> (getInfo over the materialized asset)
//   candidatesOf({baseAssetId, repairAssetId, repairedStrata}) -> EE candidates for the final filter/export
//   finalExport$({candidates, densityOffset, candidateDensityOffset, levelsByStratum}) -> Observable (filter + export)
//
// Progress vs data separation: each count summary is consumed INSIDE a switchMap and never emitted onward,
// while stage progress and the temp exports' progress are emitted via concat - so a progress object can
// never be mistaken for a count summary by the underproduction logic.
// `underproductionError({counts, strata})` is injected so an abort before the final gate reports the SAME
// classification and configuration-aware guidance the final gate would give, from the candidate counts.
export const systematicExportPlan$ = ({
    allocation, baseOffset, maxOffsetOf, requireFull, baseAssetId, repairAssetId,
    exportUnfiltered$, count$, candidatesOf, finalExport$, underproductionError
}) => {
    // The stratified finalizer consumes already-materialized candidate geometry, so it needs only the merged
    // candidates + their selected levels. candidateDensityOffset is still threaded for the unstratified finalizer.
    const finalStage$ = ({candidates, candidateDensityOffset = baseOffset, levelsByStratum}) =>
        concat(
            stage$(PROGRESS.exportFinal),
            finalExport$({candidates, densityOffset: baseOffset, candidateDensityOffset, levelsByStratum})
        )

    const levelsForRepair = ({baseLevels, repairLevels, repairedStrata}) =>
        repairedStrata.reduce(
            (acc, {stratum}) => ({...acc, [String(stratum)]: repairLevels[String(stratum)]}),
            {...baseLevels}
        )

    const afterBaseCount = summary => {
        const underproducing = underproducingStrata({summary, allocation})
        if (!underproducing.length) {
            return finalStage$({candidates: candidatesOf({baseAssetId}), levelsByStratum: summary.levels})
        }
        // requireFull (EXACT/OVER): if ANY failing stratum is already at its minimum-distance limit, no
        // repair can make the requested counts reachable - fail now rather than spend a repair export that's
        // guaranteed to leave that stratum short (which would also mislabel the failure as "after one denser
        // repair export").
        if (requireFull) {
            const nonRepairable = nonRepairableStrata({underproducing, baseOffset, maxOffsetOf})
            if (nonRepairable.length) {
                return throwError(() => underproductionError({counts: summary.raw, strata: nonRepairable}))
            }
        }
        const offset = repairOffset({underproducing, summary, baseOffset, maxOffsetOf})
        if (offset <= baseOffset) {
            // No failing stratum can be densified past its own minimum-distance limit (CLOSEST reaches here;
            // requireFull was already handled above): CLOSEST uses the best available base candidates, and
            // the requireFull branch is a defensive fallback.
            return requireFull
                ? throwError(() => underproductionError({counts: summary.raw, strata: underproducing}))
                : finalStage$({candidates: candidatesOf({baseAssetId}), levelsByStratum: summary.levels})
        }
        return concat(
            stage$(PROGRESS.prepareRepair),
            exportUnfiltered$({assetId: repairAssetId, densityOffset: offset, allocation: underproducing}),
            stage$(PROGRESS.checkRepair),
            count$({assetId: repairAssetId, allocation: underproducing, densityOffset: offset}).pipe(
                switchMap(repairSummary => {
                    const stillShort = underproducingStrata({summary: repairSummary, allocation: underproducing})
                    if (requireFull && stillShort.length) {
                        return throwError(() => underproductionError({counts: repairSummary.raw, strata: stillShort}))
                    }
                    return finalStage$({
                        candidates: candidatesOf({baseAssetId, repairAssetId, repairedStrata: underproducing}),
                        candidateDensityOffset: offset,
                        levelsByStratum: levelsForRepair({
                            baseLevels: summary.levels,
                            repairLevels: repairSummary.levels,
                            repairedStrata: underproducing
                        })
                    })
                })
            )
        )
    }

    return concat(
        stage$(PROGRESS.prepareBase),
        exportUnfiltered$({assetId: baseAssetId, densityOffset: baseOffset, allocation}),
        stage$(PROGRESS.checkBase),
        count$({assetId: baseAssetId, allocation, densityOffset: baseOffset}).pipe(
            switchMap(afterBaseCount)
        )
    )
}
