import moment from 'moment'
import {defer, map, of, shareReplay, switchMap, zip} from 'rxjs'

import {geometryAoi} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {BAYTS_ALERT_BANDS, radarObservationRecipe, radarObservationTargetDate} from '#sepal/recipe/type/baytsAlerts'

import {alertFilter} from './alertFilter.js'
import {bayts} from './bayts.js'

const DATE_FORMAT = 'YYYY-MM-DD'

const ALERT_OUTPUT_BANDS = BAYTS_ALERT_BANDS.map(({name}) => name)

const baytsAlerts = (recipe, args = {}) => {
    const reference = recipe.model.reference
    // Deferred, so a catalogue answered from the declaration builds nothing over a reference it never reads - one a
    // new recipe has not selected yet included.
    const aoi$ = defer(() => imageFactory(reference).getGeometry$())
    const {visualizationType} = args
    if (visualizationType && visualizationType !== 'alerts') {
        const delegate$ = aoi$.pipe(
            map(aoi => imageFactory(toRadarRecipe(aoi, recipe, args), args)),
            shareReplay({bufferSize: 1, refCount: true})
        )
        return {
            getImage$() {
                if (reference.type === 'ASSET') {
                    // Update mask to not get an image for the complete reference bounds
                    const asset$ = imageFactory(reference).getImage$()
                    return delegate$.pipe(
                        switchMap(delegate => {
                            return zip(delegate.getImage$(), asset$)
                        }),
                        map(([image, asset]) =>
                            image.updateMask(
                                asset.mask().reduce(ee.Reducer.max())
                            )
                        ),
                    )
                } else {
                    return delegate$.pipe(
                        switchMap(delegate => delegate.getImage$()),
                        map(image => image),
                    )
                }
            },
            getBands$() {
                return delegate$.pipe(
                    switchMap(delegate => delegate.getBands$())
                )
            },
            getGeometry$() {
                return delegate$.pipe(
                    switchMap(delegate => delegate.getGeometry$())
                )
            }
        }
    } else {
        // The alert bands are built together, whatever is asked for, so an operation naming its outputs is
        // served by projecting them.
        const {outputBands} = args
        const project = image => outputBands?.length ? image.select(outputBands) : image
        return {
            getImage$() {
                return toAlerts$(recipe, reference, aoi$, args).pipe(
                    map(project)
                )
            },
            getBands$() {
                return of(ALERT_OUTPUT_BANDS)
            },
            getGeometry$() {
                return aoi$
            }
        }
    }
}
  
const toAlerts$ = (recipe, reference, aoi$, args) => {
    const previousAlertsAsset = recipe.model.baytsAlertsOptions.previousAlertsAsset
    const initialAlerts$ = previousAlertsAsset
        ? imageFactory(previousAlertsAsset).getImage$()
        : toInitialAlerts$(recipe, reference)
    const historicalStats$ = imageFactory(reference).getImage$()
    return zip(historicalStats$, initialAlerts$, aoi$).pipe(
        map(([historicalStats, initialAlerts, aoi]) => {
            const alerts = bayts({
                ...toDates(recipe),
                ...recipe.model.options,
                ...recipe.model.baytsAlertsOptions,
                historicalStats,
                initialAlerts
            })
            return mask(recipe, historicalStats, alerts, args).clip(aoi)
        })
    )
}

const mask = (recipe, historicalStats, alerts, args) => {
    const {excludePreviouslyConfirmed, minConfidence} = alertFilter(args)
    const {startDate} = toDates(recipe)
    const HIGH_CONF = 3
    const LOW_CONF = 2
    const date = ee.Date(startDate)
    const fractionalYears = date.get('year').add(date.getFraction('year'))
    const flag = alerts.select('flag')
    const previouslyConfirmedMasked = excludePreviouslyConfirmed
        ? alerts.updateMask(alerts.select('confirmation_date').gte(fractionalYears).or(flag.neq(HIGH_CONF)))
        : alerts
    const minConfidenceMasked = minConfidence === 'high'
        ? previouslyConfirmedMasked.updateMask(flag.eq(HIGH_CONF))
        : minConfidence === 'low'
            ? previouslyConfirmedMasked.updateMask(flag.gte(LOW_CONF))
            : previouslyConfirmedMasked
    return minConfidenceMasked
        .unmask(0)
        .updateMask(alerts.mask())
        .updateMask(historicalStats.mask().reduce(ee.Reducer.max()))
}
  
const toInitialAlerts$ = (recipe, reference) => {
    const historicalStats$ = imageFactory(reference).getImage$()
    const {monitoringDuration, monitoringDurationUnit} = recipe.model.date
    const {startDate, endDate} = toDates(recipe)
    return historicalStats$.pipe(
        map(historicalStats => {
            return bayts({
                ...toDates(recipe),
                ...recipe.model.options,
                ...recipe.model.baytsAlertsOptions,
                historicalStats,
                startDate: moment(startDate, DATE_FORMAT)
                    .subtract(monitoringDuration, monitoringDurationUnit).format(DATE_FORMAT),
                endDate: moment(endDate, DATE_FORMAT)
                    .subtract(monitoringDuration, monitoringDurationUnit).format(DATE_FORMAT)
            })
        })
    )
}

// Any mode other than the alerts and the last observation is shown as the first.
const toRadarRecipe = (geometry, recipe, {visualizationType}) =>
    radarObservationRecipe({
        recipe,
        targetDate: radarObservationTargetDate(visualizationType, toDates(recipe)),
        aoi: geometryAoi(geometry)
    })

const toDates = recipe => {
    const {monitoringEnd, monitoringDuration, monitoringDurationUnit} = recipe.model.date
    const startDate = moment(monitoringEnd, DATE_FORMAT)
        .subtract(monitoringDuration, monitoringDurationUnit).format(DATE_FORMAT)
    return {startDate, endDate: monitoringEnd}
}

export default baytsAlerts
