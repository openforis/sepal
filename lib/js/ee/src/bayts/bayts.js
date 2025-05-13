const {createCollection} = require('../radar/collection')
const ee = require('#sepal/ee/ee')

function bayts(args) {
    var historicalStats = args.historicalStats
    
    var startDate = args.startDate
    var endDate = args.endDate
    var orbits = args.orbits || ['ASCENDING', 'DESCENDING']
    var geometricCorrection = args.geometricCorrection || 'ELLIPSOID'
    var outlierRemoval = 'NONE'
    var spatialSpeckleFilter = args.spatialSpeckleFilter || 'LEE'
    var kernelSize = args.kernelSize || 9
    var sigma = args.sigma || 0.9
    var strongScatterers = args.strongScatterers || 'RETAIN'
    var strongScattererValues = args.strongScattererValues || [0, -5]
    var snicSize = args.snicSize || 5
    var snicCompactness = args.snicCompactness || 0.15
    var mask = args.mask || ['SIDES', 'FIRST_LAST']
    var minAngle = args.minAngle || 30.88
    var maxAngle = args.maxAngle || 45.35
    
    var minProbability = args.minProbability || 0.05
    var maxProbability = args.maxProbability || 0.95
    
    var normalization = args.normalization || 'DISABLED'
    var sensitivity = args.sensitivity || 1
    var maxDays = args.maxDays || 90
    var minNonForestProbability = args.minNonForestProbability || 0.6
    var minChangeProbability = args.minChangeProbability || 0.5
    var highConfidenceThreshold = args.highConfidenceThreshold || 0.975
    var lowConfidenceThreshold = args.lowConfidenceThreshold || 0.85
    var wetlandMask = ee.Image(args.wetlandMaskAsset || 0)
    var initialAlerts = args.initialAlerts
        ? remapInitialAlerts(args.initialAlerts)
        : defaultInitialAlerts()
    
    var debug = args.debug || false
    
    var bandNames = ['VV', 'VH']
    
    var NO_ORBIT = 0
    var ASCENDING = 1
    var DESCENDING = 2
    
    var monitoringCollection = createMonitoringCollection()
    var compactedCollection = compactCollection(monitoringCollection)
    var change = findChange(compactedCollection)
    var alerts = postProcess(change)
    return alerts
    
    function postProcess(change) {
        var changeProbability = change.select('change_probability')
        var flag = change.select('flag')
        var remappedFlag = flag
            .where(flag.eq(1).and(changeProbability.lt(lowConfidenceThreshold)), 1)
            .where(flag.eq(1).and(changeProbability.gte(lowConfidenceThreshold)), 2)
            .where(flag.eq(2).and(changeProbability.gte(lowConfidenceThreshold)), 3) // TODO: Do we need the changeProbability check for high conf?
        return change
            .addBands(remappedFlag, null, true)
            .select(['non_forest_probability', 'change_probability', 'flag', 'flag_orbit', 'first_detection_date', 'confirmation_date'])
    }
    
    function findChange(collection) {
        var NO_CHANGE = 0
        var LOW_CONF = 1
        var HIGH_CONF = 2
          
        if (debug) {
            var alertCollection = ee.ImageCollection(
                collection.iterate(
                    function (image, alertCollection) {
                        alertCollection = ee.ImageCollection(alertCollection)
                        var last = ee.Image(alertCollection.get('last'))
                        var updated = update(image, last)
                        return alertCollection.merge(ee.ImageCollection([updated]))
                            .set('last', updated)
                    },
                    ee.ImageCollection([]).set('last', initialAlerts)
                )
            )
            var alerts = ee.Image(alertCollection.get('last'))
            Map.addLayer(historicalStats, null, 'historicalStats', false)
            Map.addLayer(collection.select(['VV', 'VH']), null, 'VV, VH', false)
            Map.addLayer(collection.select(['non_forest_probability', 'VH_non_forest_probability']), null, 'non_forest_probability, VH_non_forest_probability', false)
            Map.addLayer(alertCollection.select(['non_forest_probability', 'change_probability', 'flag']), null, 'non_forest_probability, change_probability, flag', false)
            return alerts
        } else {
            return ee.Image(
                collection.iterate(update, initialAlerts)
            )
        }
    
        function update(image, prev) {
            image = ee.Image(image)
            prev = ee.Image(prev)
        
            var date = image.select('date')
            var orbit = image.select('orbit')
            var prevFlag = toPrevFlag(date)
            var pnf = toPnf()
            var sameOrbitOrHighPnf = isSameOrbitOrHighPnf(orbit, pnf)
            var prior = toPrior(prevFlag)
            var changeProbability = toChangeProbability(prior, pnf, sameOrbitOrHighPnf)
            var flag = toFlag(prevFlag, pnf, changeProbability, sameOrbitOrHighPnf)
            var flagOrbit = toFlagOrbit(prevFlag, orbit)
            var firstDetectionDate = toFirstDetectionDate(prevFlag, date)
            var confirmationDate = toConfirmationDate(prevFlag, date)
            return pnf
                .addBands(changeProbability)
                .addBands(flag)
                .addBands(flagOrbit)
                .addBands(firstDetectionDate)
                .addBands(confirmationDate)
                .unmask(prev)
          
            function toPrevFlag(date) {
                var flagDate = prev.select('first_detection_date').max(prev.select('confirmation_date'))
                var daysSinceFlag = flagDate.subtract(date).multiply(365)
                var prevFlag = prev.select('flag')
                return prevFlag
                    .where(
                        prevFlag.neq(HIGH_CONF)
                            .and(daysSinceFlag.gt(maxDays)),
                        NO_CHANGE
                    )
            }
        
            function toPnf() {
                return image.select('non_forest_probability')
                    .where(
                        wetlandMask.and(prev.select('flag').eq(LOW_CONF)),
                        image.select('VH_non_forest_probability')
                    )
                    .float()
            }
        
            function isSameOrbitOrHighPnf(orbit, pnf) {
                var prevFlagOrbit = prev.select('flag_orbit')
                var sameOrbit = prevFlagOrbit.eq(NO_ORBIT).or(prevFlagOrbit.eq(orbit))
                return sameOrbit.or(pnf.gte(minNonForestProbability)).rename('sameOrbitOrHighPnf')
            }
        
            function toPrior(prevFlag) {
                return prev.select('change_probability')
                    .where(prevFlag.eq(NO_CHANGE), prev.select('non_forest_probability'))
                    .float()
            }
        
            function toChangeProbability(prior, pnf, sameOrbitOrHighPnf) {
                var differentOrbitAndLowPnf = sameOrbitOrHighPnf.not()
                return bayesianUpdate(prior, pnf)
                    .where(
                        prevFlag.eq(LOW_CONF).and(differentOrbitAndLowPnf), // [4b]
                        prev.select('change_probability')
                    )
                    .where(
                        prevFlag.eq(NO_CHANGE).and(pnf.lt(minNonForestProbability)), // [7]
                        0
                    )
                    .float()
            }
        
            function toFlag(prevFlag, pnf, changeProbability, sameOrbitOrHighPnf) {
                var differentOrbitAndLowPnf = sameOrbitOrHighPnf.not()
                return prevFlag
                    .where( // [1]
                        prevFlag.eq(HIGH_CONF),
                        HIGH_CONF
                    )
                    .where( // [2]
                        prevFlag.eq(LOW_CONF)
                            .and(changeProbability.lt(minChangeProbability))
                            .and(sameOrbitOrHighPnf),
                        NO_CHANGE
                    )
                    .where( // [3]
                        prevFlag.eq(LOW_CONF)
                            .and(changeProbability.gte(minChangeProbability).and(changeProbability.lt(highConfidenceThreshold)))
                            .and(sameOrbitOrHighPnf),
                        LOW_CONF
                    )
                    .where( // [4]
                        prevFlag.eq(LOW_CONF)
                            .and(changeProbability.gte(minChangeProbability).and(changeProbability.gte(highConfidenceThreshold)))
                            .and(sameOrbitOrHighPnf),
                        HIGH_CONF
                    )
                    .where( // [4b]
                        prevFlag.eq(LOW_CONF)
                            .and(differentOrbitAndLowPnf),
                        LOW_CONF
                    )
                    .where( // [5]
                        prevFlag.eq(NO_CHANGE)
                            .and(pnf.gte(minNonForestProbability))
                            .and(changeProbability.lt(highConfidenceThreshold)),
                        LOW_CONF
                    )
                    .where( // [6]
                        prevFlag.eq(NO_CHANGE)
                            .and(pnf.gte(minNonForestProbability))
                            .and(changeProbability.gte(highConfidenceThreshold)),
                        HIGH_CONF
                    )
                    .where( // [7]
                        prevFlag.eq(NO_CHANGE)
                            .and(pnf.lt(minNonForestProbability)),
                        NO_CHANGE
                    )
            }
        
            function toFlagOrbit(prevFlag, orbit) {
                return prev.select('flag_orbit')
                    .where( // We might want to only update NO_CHANGE to LOW_CONF
                        flag.neq(prevFlag),
                        orbit
                    )
                    .where(
                        flag.eq(NO_CHANGE),
                        0
                    )
            }
          
            function toFirstDetectionDate(prevFlag, date) {
                return prev.select('first_detection_date')
                    .where(
                        flag.neq(prevFlag).and(flag.eq(LOW_CONF)),
                        date
                    )
                    .where(
                        flag.eq(NO_CHANGE),
                        0
                    )
            }
        
            function toConfirmationDate(prevFlag, date) {
                return prev.select('confirmation_date')
                    .where(
                        flag.neq(prevFlag).and(flag.eq(HIGH_CONF)),
                        date
                    )
                    .where(
                        flag.eq(NO_CHANGE),
                        0
                    )
            }
        
            function bayesianUpdate(prior, likelihood) {
                return ee.Image().expression(
                    '(prior * likelihood)/((prior * likelihood) + ((1 - prior) * (1 - likelihood)))', {
                        prior: prior.select('change_probability'),
                        likelihood
                    }
                ).rename('change_probability')
            }
        }
    }
  
    function compactCollection(collection) {
        var OBSERVATION_AXIS = 0
        var BAND_AXIS = 1
      
        var bandNames = collection.first().bandNames()
        var array = collection.toArray()
        var days = ee.Date(endDate).difference(ee.Date(startDate), 'days')
        var minRevisitTime = 6
        var maxImages = days.divide(minRevisitTime).multiply(orbits.length).floor()
        var numberOfObservations = array.arrayLength(OBSERVATION_AXIS)
      
        return ee.ImageCollection(ee.List.sequence(0, maxImages.subtract(1))
            .map(function (i) {
                i = ee.Number(i).byte()
                return array
                    .updateMask(numberOfObservations.gt(i))
                    .arraySlice(OBSERVATION_AXIS, i, i.add(1))
                    .arrayProject([BAND_AXIS])
                    .arrayFlatten([bandNames])
            })
        )
    }
      
    function createMonitoringCollection() {
        var monitoringCollection = createCollection({
            startDate,
            endDate,
            geometry: historicalStats.geometry(),
            orbits,
            geometricCorrection,
            outlierRemoval,
            orbitOverlap: 'ADJACENT',
            spatialSpeckleFilter,
            kernelSize,
            sigma,
            strongScatterers,
            strongScattererValues,
            snicSize,
            snicCompactness,
            multitemporalSpeckleFilter: 'NONE',
            mask,
            minAngle,
            maxAngle,
            minObservations: 1,
            beforeGeometricCorrection: compose([applyMultitemporalFilter, maskOrbits]),
            afterDbConversion: compose([normalizeImage, addPnf, addDate, addOrbit])
        })
        return debug
            ? monitoringCollection
            : monitoringCollection.select(['non_forest_probability', 'VH_non_forest_probability', 'date', 'orbit'])
      
        function applyMultitemporalFilter(image) {
            var stats = extractOrbitStats(image)
            var filtered = image.select(bandNames)
                .multiply(stats.select('.*_speckle').rename(bandNames))
            return image
                .addBands(filtered, null, true)
        }
      
        function maskOrbits(image) {
            var stats = extractOrbitStats(image)
            return image
                .updateMask(image.select('orbit').eq(stats.select('orbit')))
        }
        
        function normalizeImage(image) {
            if (normalization === 'DISABLED') {
                return image
            }
            var stats = extractOrbitStats(image)
            var forest = image.select('VV').gt(-12.5)
                .and(image.select('VH').gt(-17.5))
                .and(stats.select('VV_std').lte(1))
                .and(stats.select('VH_std').lte(1))
            var region = image.geometry().intersection(historicalStats.geometry(), 10)
            var reductionArgs = {
                reducer: ee.Reducer.mean(),
                scale: region.area().divide(4).min(1000),
                tileScale: 16,
                bestEffort: true,
                geometry: region
            }
            var imageMean = image
                .select(bandNames)
                .updateMask(forest)
                .reduceRegion(reductionArgs)
                .toImage()
                .select(bandNames)
            var historicalMean = stats
                .select('.*_mean')
                .rename(bandNames)
                .updateMask(forest)
                .reduceRegion(reductionArgs)
                .toImage()
                .select(bandNames)
            var adjustment = historicalMean
                .subtract(imageMean)
                .where(
                    imageMean.gt(historicalMean),
                    0
                )
            var adjusted = image
                .select(bandNames)
                .add(adjustment)
            return image
                .addBands(adjusted, null, true)
        }
      
        function addDate(image) {
            var date = ee.Image(image.date().get('year').add(image.date().getFraction('year')))
                .float()
                .rename('date')
            return image.addBands(date)
        }
      
        function addOrbit(image) {
            var orbits = ee.Dictionary({
                NO_ORBIT,
                ASCENDING,
                DESCENDING
            })
        
            var orbit = ee.Image(
                orbits.getNumber(
                    image.getString('orbitProperties_pass')
                )
            ).rename('orbit')
            return image.addBands(orbit)
        }
      
        function addPnf(image) {
            var stats = extractOrbitStats(image)
            var mean = stats.select('.*_mean')
            var sd = stats.select('.*_std')
            var forestP = pdf(image, mean, sd.multiply(2 * sensitivity))
            var nonForestP = pdf(image, mean.subtract(sd.multiply(4 * sensitivity)), sd.multiply(2 * sensitivity))
            var pnf = nonForestP.divide(nonForestP.add(forestP))
                .float()
                .clamp(minProbability, maxProbability)
            var vhPnf = pnf
                .select('VH')
                .rename('VH_non_forest_probability')
            var maxPnf = pnf
                .reduce(ee.Reducer.max())
                .rename('non_forest_probability')
            return image
                .addBands(vhPnf)
                .addBands(maxPnf)
        }
      
        function pdf(image, mean, sd) {
            return ee.Image().expression(
                '(1 / (sd * sqrt(2 * PI))) * exp(-(1/2) * pow((x - mean) / sd, 2))', {
                    sd,
                    mean,
                    x: image.select(bandNames),
                    PI: Math.PI
                }).rename(bandNames)
        }
      
        function extractOrbitStats(image) {
            var orbitBandPostfixes = ee.Dictionary({
                ASCENDING: 'asc',
                DESCENDING: 'desc',
            })
            return historicalStats
                .select(ee.String('.*_').cat(orbitBandPostfixes.getString(image.getString('orbitProperties_pass'))))
                .regexpRename('(.*)_.*', '$1', false)
        }
      
        function compose(functions) {
            return function (image) {
                return functions.reduce(function (acc, fun) { return fun(acc) }, image)
            }
        }
    }
    
    function remapInitialAlerts(alerts) {
        var flag = alerts.select('flag')
        var remappedFlag = flag
            .where(flag.eq(2), 1)
            .where(flag.eq(3), 3)
        return alerts
            .addBands(remappedFlag, null, true)
            .select(['non_forest_probability', 'change_probability', 'flag', 'flag_orbit', 'first_detection_date', 'confirmation_date'])
  
    }
    
    function defaultInitialAlerts() {
        return ee.Image([
            ee.Image(0.5).rename('non_forest_probability'),
            ee.Image(0).rename('change_probability'),
            ee.Image(0).rename('flag'),
            ee.Image(0).rename('flag_orbit'),
            ee.Image(0).rename('first_detection_date'),
            ee.Image(0).rename('confirmation_date'),
        ])
    }
}

module.exports = {bayts}
