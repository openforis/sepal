import {forkJoin, map, of, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {calculateIndex} from '#sepal/ee/optical/indexes'
import {loadRecipe$} from '#sepal/ee/recipe'
import recipeRef from '#sepal/ee/recipeRef'
import {getCollection$} from '#sepal/ee/timeSeries/collection'
import {validateEEImage} from '#sepal/ee/validate'

import {toUolParams} from './params.js'
import {runPyeoChangeAlerts} from './runPyeoChangeAlerts.js'

const CHANGE_REPORT_BANDS = [
    'available_image_count', 'occluded_count', 'total_changes',
    'first_change_date_above_threshold', 'post_fcd_change_count',
    'post_fcd_nochange_count', 'post_fcd_occluded_count',
    'post_fcd_valid_image_count', 'post_fcd_change_repeatability_pct',
    'binary_timeseries_decision', 'fcd_decision_map', 'delta_index_change_count',
    'binary_delta_index_decision_map', 'binary_delta_class_decision_map',
    'binary_combined_delta_decision_map', 'from_class_count', 'to_class_count',
    'binary_decision_from_to_map'
]

// Baseline and monitoring gate_index are int16 ×INDEX_SCALE — the scale getCollection$ gives
// indices — so they compare directly; the threshold below is scaled to match.
const INDEX_SCALE = 10000

// fcd_decision_map is epoch ms. The map renders a date only for dataType:'fractionalYears', decoded
// CALENDAR-style by format.fractionalYearsToDate (year + fraction of that calendar year). Encode to
// match — a uniform ms/365.25 from 1970 drifts ~1 day and flips the year near Jan 1. Piecewise over
// the window's years; mirrors changeAlerts' ee.Date().getFraction('year'). No-change pixels stay masked.
const toFractionalYear = (msBand, startYear, endYear) => {
    const years = []
    for (let year = startYear; year <= endYear; year++) {
        years.push(year)
    }
    const fractionalYear = years.reduce((acc, year) => {
        const yearStart = ee.Date.fromYMD(year, 1, 1).millis()
        const nextYearStart = ee.Date.fromYMD(year + 1, 1, 1).millis()
        const value = msBand.subtract(yearStart).divide(nextYearStart.subtract(yearStart)).add(year)
        return acc.where(msBand.gte(yearStart).and(msBand.lt(nextYearStart)), value)
    }, msBand)
    return fractionalYear.updateMask(msBand.mask())
}

const pyeoAlerts = (recipe, {selection = []} = {}) => {
    const {model} = recipe
    const {monitoringStart, monitoringEnd} = model.dates
    const classificationId = model.sources.classification
    const {changeFromClasses = [], changeToClasses = []} = model.sources || {}
    const uolParams = toUolParams({...model.pyeoAlertsOptions, changeFromClasses, changeToClasses})
    const gateIndex = uolParams.indexGate.index
    uolParams.indexGate.threshold *= INDEX_SCALE

    const toImage$ = () => {
        // Empty From/To builds ee.ImageCollection([]).max() and fails server-side after a long run;
        // short-circuit with a friendly error.
        if (!changeFromClasses.length || !changeToClasses.length) {
            return of(noChangeClassesError())
        }
        return toGeometry$(model.aoi).pipe(
            switchMap(geometry =>
                forkJoin({
                    classificationRecipe: recipeRef({id: classificationId}).getRecipe$(),
                    classificationInputs: loadClassificationInputs$()
                }).pipe(
                    switchMap(({classificationRecipe, classificationInputs: {eeBaselineGateIndex, classifierBands}}) =>
                        forkJoin({
                            trainingData: classificationRecipe.getTrainingData$(),
                            eeClassificationImage: classificationRecipe.getImage$(),
                            monitoringCollection: monitoringCollection$(classifierBands, geometry)
                        }).pipe(
                            map(({trainingData, eeClassificationImage, monitoringCollection}) =>
                                toChangeReport({
                                    geometry, classificationRecipe, trainingData, eeClassificationImage,
                                    eeBaselineGateIndex, monitoringCollection
                                })
                            )
                        )
                    )
                )
            )
        )
    }

    // The classification's own input imagery, loaded once: the bands it carries (so monitoring can
    // reproduce what the classifier references) and its gate_index. RECIPE_REF mosaics compute the
    // index band directly; an ASSET can't synthesize bands, so we pull it and compute the index.
    const loadClassificationInputs$ = () =>
        loadRecipe$(classificationId).pipe(
            switchMap(classification => {
                const images = (classification.model.inputImagery && classification.model.inputImagery.images) || []
                if (images.length !== 1) {
                    throw new Error('pyeoAlerts: the classification must have exactly one input image')
                }
                const input = images[0]
                const eeBaselineGateIndex$ = input.type === 'RECIPE_REF'
                    ? imageFactory(input, {selection: [gateIndex]}).getImage$().pipe(
                        map(image => image.select([gateIndex], ['gate_index']))
                    )
                    : imageFactory(input).getImage$().pipe(
                        map(image => calculateIndex(image, gateIndex).multiply(INDEX_SCALE).int16().rename('gate_index'))
                    )
                return forkJoin({
                    eeBaselineGateIndex: eeBaselineGateIndex$,
                    classifierBands: imageFactory(input).getBands$()
                })
            })
        )

    // Per-scene monitoring collection from this recipe's editable sources, via the timeSeries builder.
    // We null sources.classification (else it runs its own regression/probability classifier) and
    // classify to categorical 'class' ourselves; dates renamed to its {startDate, endDate} shape.
    // Mirrors changeAlerts.js:184-191.
    const monitoringCollection$ = (classifierBands, geometry) =>
        getCollection$({
            recipe: {model: {
                ...model,
                dates: {startDate: monitoringStart, endDate: monitoringEnd},
                sources: {...model.sources, classification: null}
            }},
            geometry,
            bands: classifierBands.includes(gateIndex)
                ? classifierBands
                : [...classifierBands, gateIndex]
        })

    const toChangeReport = ({geometry, classificationRecipe, trainingData, eeClassificationImage, eeBaselineGateIndex, monitoringCollection}) => {
        const classifiedBaseline = toClassifiedBaseline(eeClassificationImage, eeBaselineGateIndex)
        // EE doesn't guarantee order after filter/map and the algorithm walks scenes chronologically.
        const classifiedMonitoringCollection = monitoringCollection
            .sort('system:time_start')
            .map(image => classifyScene(image, classificationRecipe, trainingData))
        const changeReport = runPyeoChangeAlerts({
            aoi: geometry,
            classifiedBaseline,
            classifiedMonitoringCollection,
            ...uolParams
        }).clip(geometry)
        // Re-express the change-date band from epoch ms to a calendar fractional year so the map
        // decoder renders the correct date (see toFractionalYear).
        const startYear = Number(monitoringStart.slice(0, 4))
        const endYear = Number(monitoringEnd.slice(0, 4))
        const report = changeReport.addBands(
            toFractionalYear(changeReport.select('fcd_decision_map'), startYear, endYear).rename('fcd_decision_map'),
            null, true
        )
        const image = selection.length ? report.select(selection) : report
        return validateEEImage({
            valid: monitoringCollection.limit(1).size(),
            image,
            error: {
                userMessage: {
                    message: 'No monitoring images match the recipe configuration. Update the dates or sources.',
                    key: 'process.pyeoAlerts.error.noImages'
                },
                statusCode: 400
            }
        })
    }

    // Classify a scene to categorical 'classification' + carry its already-scaled gate_index. The
    // classifier derives its own covariates from raw bands, so no pre-added tasseled cap.
    const classifyScene = (image, classificationRecipe, trainingData) =>
        classificationRecipe
            .classifyImage(image, ['class'], trainingData)
            .rename(['classification'])
            .addBands(image.select([gateIndex], ['gate_index']))
            .copyProperties(image, ['system:time_start'])

    const toClassifiedBaseline = (eeClassificationImage, eeBaselineGateIndex) =>
        eeClassificationImage
            .select(['class'], ['classification'])
            .addBands(eeBaselineGateIndex)

    const noChangeClassesError = () =>
        validateEEImage({
            valid: 0,
            image: ee.Image(0),
            error: {
                userMessage: {
                    message: 'Select at least one "From" class and one "To" class in the change-detection options.',
                    key: 'process.pyeoAlerts.error.noChangeClasses'
                },
                statusCode: 400
            }
        })

    return {
        getImage$() {
            return toImage$()
        },
        getBands$() {
            return of(CHANGE_REPORT_BANDS)
        },
        getGeometry$() {
            return toGeometry$(model.aoi)
        }
    }
}

export default pyeoAlerts
