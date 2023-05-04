const {map, of, shareReplay, switchMap, zip} = require('rxjs')
const {bayts} = require('./bayts')
const ee = require('#sepal/ee')
const moment = require('moment')
const imageFactory = require('#sepal/ee/imageFactory')

const DATE_FORMAT = 'YYYY-MM-DD'

const baytsAlerts = (
    recipe,
    {...args} = {
        visualizationType: 'alerts',
        previouslyConfirmed: 'include',
        minConfidence: 'all'
    }
) => {
    const reference = recipe.model.reference
    const aoi$ = imageFactory(reference).getGeometry$()
    const {visualizationType} = args
    if (visualizationType && visualizationType !== 'alerts') {
        const delegate$ = aoi$.pipe(
            map(aoi => imageFactory(toRadarRecipe(aoi, recipe, args), args)),
            shareReplay()
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
                return of(['PNF', 'pChange', 'flag', 'flag_orbit', 'first_detection_date', 'confirmation_date'])
            },
            getGeometry$() {
                return delegate$.pipe(
                    switchMap(delegate => delegate.getGeometry$())
                )
            }
        }
    } else {
        return {
            getImage$() {
                return toAlerts$(recipe, reference, aoi$, args)
                
            },
            getBands$() {
                return toAlerts$(recipe, reference, aoi$, args).pipe(
                    switchMap(image => ee.getInfo$(image.bandNames()))
                )
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

const mask = (recipe, historicalStats, alerts, {previouslyConfirmed, minConfidence}) => {
    const {startDate} = toDates(recipe)
    const HIGH_CONF = 3
    const LOW_CONF = 2
    const date = ee.Date(startDate)
    const fractionalYears = date.get('year').add(date.getFraction('year'))
    const flag = alerts.select('flag')
    const previouslyConfirmedMasked = previouslyConfirmed === 'include'
        ? alerts
        : alerts.updateMask(alerts.select('confirmation_date').gte(fractionalYears).or(flag.neq(HIGH_CONF)))
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

const toRadarRecipe = (aoi, recipe, {visualizationType}) => {
    const {startDate, endDate} = toDates(recipe)
    return {
        type: 'RADAR_MOSAIC',
        model: {
            aoi,
            dates: {
                targetDate: visualizationType === 'last'
                    ? endDate
                    : startDate
            },
            options: {
                ...recipe.model.options
            }
        }
    }
}

const toDates = recipe => {
    const {monitoringEnd, monitoringDuration, monitoringDurationUnit} = recipe.model.date
    const startDate = moment(monitoringEnd, DATE_FORMAT)
        .subtract(monitoringDuration, monitoringDurationUnit).format(DATE_FORMAT)
    return {startDate, endDate: monitoringEnd}
}

module.exports = baytsAlerts
