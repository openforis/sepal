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

// The UoL algorithm emits fcd_decision_map as epoch milliseconds. SEPAL only renders a band as a
// real date when it's a fractional year tagged dataType:'fractionalYears' (paletteLayer.formatValue),
// so we re-express it as ms ÷ MILLIS_PER_YEAR + 1970. 31557600000 = 365.25 days in ms; the value is
// a satellite-overpass instant, so ≈day precision is inherent and fine.
const MILLIS_PER_YEAR = 31557600000

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
        // Re-express the change-date band from epoch ms to fractional year so the map renders a date.
        const report = changeReport.addBands(
            changeReport.select('fcd_decision_map').divide(MILLIS_PER_YEAR).add(1970).rename('fcd_decision_map'),
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
