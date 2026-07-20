import {forkJoin, map, switchMap, throwError} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import {effectiveArrangement} from '#sepal/ee/samplingDesign/effectiveArrangement'
import {EXPORT_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {randomSamples$} from '#sepal/ee/samplingDesign/samples'
import {stratificationImage$} from '#sepal/ee/samplingDesign/stratificationImage'
import {unstratifiedAllocation$} from '#sepal/ee/samplingDesign/unstratifiedArea'
import {getSampleCounts$} from '#sepal/ee/samplingDesign/validateSampleCounts'
import {effectiveMinSamplesPerStratum} from '#sepal/recipe/samplingDesign/minSamples'
import {resolveSamplingGrid} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {tableToAsset$} from '#task/jobs/export/tableToAsset'
import {tableToSepal$} from '#task/jobs/export/tableToSepal'

import {formatProperties} from '../formatProperties.js'
import {finalCountError} from './finalValidationGate.js'
import {randomExportPlan$} from './randomExportPlan.js'
import {stratifiedGridError} from './samplingGridValidation.js'
import {samplingDesignPreflightError} from './samplingPreflight.js'

export const exportRandomToAssets$ = ({taskId, description, recipe, assetId, strategy, destination, workspacePath, filenamePrefix, fileFormat, properties = {}}) => {
    const {model: {aoi, stratification, sampleAllocation: {allocation}}} = recipe
    const configuredArrangement = effectiveArrangement(recipe.model)
    // Asset exports keep rows minimal + collection-level metadata; SEPAL/CSV keeps full per-row columns.
    const rowMetadata = destination === 'SEPAL'

    // Random sampling draws over a raster grid in both modes, so both need exactly one valid grid definition
    // in a supported CRS - enforced before any EE graph is built.
    const gridError = stratifiedGridError(configuredArrangement)

    // Enforce the minimum-sample contract on the submitted recipe BEFORE building any EE graph, so an
    // impossible design fails immediately instead of after an expensive export.
    const preflightError = samplingDesignPreflightError(recipe)

    // Resolved configuration the final-count advice reasons about; random sampling has no systematic
    // sample-size strategy, so requested counts are always required. Spacing and grid settings are
    // Systematic-only, so the advice has none of them to reason about here.
    const validationConfig = {
        arrangementStrategy: 'RANDOM',
        allocationStrategy: recipe.model.sampleAllocation?.allocationStrategy,
        effectiveMinimum: effectiveMinSamplesPerStratum(recipe.model.sampleAllocation || {})
    }

    // Final guard: stratifiedSample draws at most the requested count per stratum, so any shortfall is real.
    // The counted final collection is classified against the same minimum-sample contract the systematic
    // routes use, and randomExportPlan$ runs this before the export, so a failing design never starts one.
    const validate$ = resolvedAllocation => samples =>
        getSampleCounts$(samples, 'final validation count').pipe(
            map(counts => {
                const error = finalCountError({counts, allocation: resolvedAllocation, config: validationConfig})
                if (error) {
                    throw error
                }
                return counts
            })
        )

    const export$ = samples => destination === 'SEPAL'
        ? tableToSepal$(taskId, {
            collection: samples,
            description,
            workspacePath,
            filenamePrefix,
            fileFormat,
            selectors: EXPORT_PROPERTY_NAMES
        })
        : tableToAsset$({
            taskId,
            collection: samples,
            description,
            assetId,
            strategy
        })

    if (gridError) {
        return throwError(() => gridError)
    }

    // Validated as configured (option ids); resolved to EE-ready CRS for every graph built below.
    const sampleArrangement = resolveSamplingGrid(configuredArrangement)

    if (preflightError) {
        return throwError(() => preflightError)
    }

    return forkJoin({
        eeStratification: stratificationImage$(stratification),
        region: toGeometry$(aoi)
    }).pipe(
        // Unstratified designs carry no per-stratum area; inject the AOI geometry area into the single row
        // before generating candidates or writing metadata. Stratified allocation passes through unchanged.
        switchMap(({eeStratification, region}) =>
            unstratifiedAllocation$({allocation, stratification, geometry: region}).pipe(
                switchMap(resolvedAllocation =>
                    randomExportPlan$({
                        // Shared generation: adaptive density, thinning, sample + reproduction metadata.
                        samples$: randomSamples$({allocation: resolvedAllocation, eeStratification, region, sampleArrangement, rowMetadata}).pipe(
                            map(featureCollection => featureCollection.set(formatProperties(properties)))
                        ),
                        validate$: validate$(resolvedAllocation),
                        export$
                    })
                )
            )
        )
    )
}
