import {concat, of, switchMap} from 'rxjs'

import {swallow} from '#sepal/rxjs'
import {progress} from '#task/rxjs/operators'

// Coarse stage-level task progress for the random export, mirroring the systematic UX. Sampling-Design
// text lives here, not in the generic table-export helpers.
const PROGRESS = {
    prepareCandidates: {messageKey: 'tasks.samplingDesign.random.progress.prepareCandidates', defaultMessage: 'Preparing random sample candidates'},
    checkCandidates: {messageKey: 'tasks.samplingDesign.random.progress.checkCandidates', defaultMessage: 'Checking random sample candidates'},
    exportFinal: {messageKey: 'tasks.samplingDesign.random.progress.exportFinal', defaultMessage: 'Exporting final sample design'}
}

const stage$ = descriptor => of(undefined).pipe(progress(descriptor))

// Random export flow with stage progress: prepare candidates -> check candidates -> export final. Effects
// are injected so ordering is testable without EE:
//   samples$          -> Observable emitting the finalized sample FeatureCollection
//   validate$(samples)-> Observable (count guard; swallowed - only a guard, not task output)
//   export$(samples)  -> Observable (table export; keeps its own EE progress)
//
// The finalized samples are consumed inside a switchMap and never emitted as task progress; stage progress
// and the export's own EE progress are emitted via concat - so data can't be mistaken for progress.
export const randomExportPlan$ = ({samples$, validate$, export$}) =>
    concat(
        stage$(PROGRESS.prepareCandidates),
        samples$.pipe(
            switchMap(samples => concat(
                stage$(PROGRESS.checkCandidates),
                validate$(samples).pipe(swallow()),
                stage$(PROGRESS.exportFinal),
                export$(samples)
            ))
        )
    )
