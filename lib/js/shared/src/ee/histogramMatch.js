const ee = require('sepal/ee')
const {bitwiseExtract} = require('sepal/ee/bitwiseExtract')

// const normalizeCollection = (collection, aoi, referenceSource, referenceScale, imageScale) => collection.map(function (image) {
//     const reference = createReference(image.date(), image.date(), aoi, referenceSource)
//     return histogramMatch(image.int16(), reference, referenceScale, imageScale)
// })

// const createComposite = (collection, startDate, endDate, aoi, referenceSource, referenceScale, compositeScale) => {
//     const reference = createReference(startDate, endDate, aoi, referenceSource)
//     // Map.addLayer(reference, rgbVis, 'reference')
//     return collection
//         .map(function(image) {
//             return histogramMatch(image.int16(), reference, referenceScale, compositeScale)
//         })
//         .median()
//         .int16()
//         .clip(aoi)
// }

// const preProcessPlanetCollection = (collection, startDate, endDate, aoi) => {
//     const udm1Collection = collection
//         .filterBounds(aoi)
//         .filterDate(startDate, endDate)
//         .filter(ee.Filter.eq('system:band_names', ['B1', 'B2', 'B3', 'B4', 'udm1']))
//         .map(function (image) {
//             const mask = image.select('udm1').not()
//             return image.updateMask(mask)
//         })
//         .select(['B1', 'B2', 'B3', 'B4'], ['blue', 'green', 'red', 'nir'])
//
//     const udm2Collection = collection
//         .filterBounds(aoi)
//         .filterDate(startDate, endDate)
//         .filter(ee.Filter.eq('system:band_names', ['B1', 'B2', 'B3', 'B4', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']))
//         .map(function (image) {
//             const qa = image.select(
//                 ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'],
//                 ['clear', 'snow', 'shadow', 'lightHaze', 'heavyHaze', 'cloud', 'confidence']
//             )
//             const mask = qa.select('clear')
//                 .and(qa.select('snow').not())
//                 .and(qa.select('shadow').not())
//                 .and(qa.select('lightHaze').not())
//                 .and(qa.select('heavyHaze').not())
//                 .and(qa.select('cloud').not())
//                 .and(qa.select('confidence')) // Actually between 0 and 100, but I'll mask out pixels with no confidence
//             return image.updateMask(mask)
//         })
//         .select(['B1', 'B2', 'B3', 'B4'], ['blue', 'green', 'red', 'nir'])
//
//     return udm1Collection
//         .merge(udm2Collection)
// }

const createReference = (startDate, endDate, aoi, source) => {
    startDate = ee.Date(startDate)
    endDate = ee.Date(endDate)
    const days = ee.Date(endDate).difference(ee.Date(startDate), 'days').floor()
    const minDays = ee.Number(32)
    const adjustment = minDays.subtract(days).divide(2).max(0)
    const referenceStartDate = startDate.advance(adjustment.multiply(-1), 'days')
    const referenceEndDate = endDate.advance(adjustment, 'days')
    const referenceCollection = ee.ImageCollection(
        [2, -2, 1, -1, 0].map(toReference)
    ).filterMetadata('system:band_names', 'not_equals', [])
    return referenceCollection.mosaic()

    function toReference(yearOffset) {
        return source === 'LANDSAT'
            ? landsatReference(referenceStartDate, referenceEndDate, yearOffset, aoi)
            : modisReference(referenceStartDate, referenceEndDate, yearOffset)
    }

    function modisReference(referenceStartDate, referenceEndDate, yearOffset) {
        return ee.ImageCollection('MODIS/006/MOD09A1')
            .filterDate(
                referenceStartDate.advance(yearOffset, 'years'),
                referenceEndDate.advance(yearOffset, 'years')
            )
            .select(
                ['sur_refl_b03', 'sur_refl_b04', 'sur_refl_b01', 'sur_refl_b02', 'StateQA'],
                ['blue', 'green', 'red', 'nir', 'StateQA']
            )
            .map(function(image) {
                const qa = image.select('StateQA')
                const clear = bitwiseExtract(qa, 0, 1).eq(0)
                return image.updateMask(
                    clear
                )
            })
            .median()
    }

    function landsatReference(referenceStartDate, referenceEndDate, yearOffset, aoi) {
        return ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
            .filterDate(
                referenceStartDate.advance(yearOffset, 'years'),
                referenceEndDate.advance(yearOffset, 'years')
            )
            .filterBounds(aoi)
            .select(
                ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'pixel_qa'],
                ['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'pixel_qa']
            )
            .map(function (image) {
                const qa = image.select('pixel_qa')
                return applyBRDFCorrection(image)
                    .updateMask(qa.bitwiseAnd(2).or(qa.bitwiseAnd(4))) // Clear or water
                    .select(['blue', 'green', 'red', 'nir'])
            })
            .median()

        function applyBRDFCorrection(image) {
            return ee.Image(
                correct(image)
            ).uint16()

            function correct(image) {
                const viewAngles = getViewAngles(image)
                const viewAz = viewAngles.viewAz
                const viewZen = viewAngles.viewZen
                const sunAngles = getSunAngles(image.date())
                const sunAz = sunAngles.sunAz
                const sunZen = sunAngles.sunZen
                const sunZenOut = getSunZenOut(image.geometry())
                const relativeSunViewAz = sunAz.subtract(viewAz)
                const kvol = rossThick(sunZen, viewZen, relativeSunViewAz)
                const kvol0 = rossThick(sunZenOut, 0, 0)
                const kgeo = liThin(sunZen, viewZen, relativeSunViewAz)
                const kgeo0 = liThin(sunZenOut, 0, 0)
                return image.addBands(
                    adjustBands(image, kvol, kvol0, kgeo, kgeo0),
                    null, true
                )
            }

            function getViewAngles(image) {
                const maxZenith = 7.5

                function findCorners(track) {
                    const bounds = ee.List(track.bounds().coordinates().get(0))
                    const coords = ee.List(track.coordinates().get(0))
                    const xs = coords.map(x)
                    const ys = coords.map(y)

                    function findCorner(targetValue, values, otherTargetValue, otherValues) {
                        const featureCollection = ee.FeatureCollection(
                            coords.zip(values).zip(otherValues).map(function (element) {
                                element = ee.List(element)
                                const coord = ee.List(element.get(0)).get(0)
                                const value = ee.Number(ee.List(element.get(0)).get(1))
                                const otherValue = ee.Number(element.get(1))
                                return ee.Feature(null, {
                                    coord,
                                    value,
                                    otherValue,
                                    diff: value.subtract(targetValue).abs().add(otherValue.subtract(otherTargetValue).abs())
                                })
                            })
                        )
                        return featureCollection
                            .reduceColumns(ee.Reducer.min(2), ['diff', 'coord'])
                            .get('min1')
                    }

                    const lowerLeft = findCorner(x(bounds.get(0)), xs, y(bounds.get(0)), ys)
                    const lowerRight = findCorner(y(bounds.get(1)), ys, x(bounds.get(1)), xs)
                    const upperRight = findCorner(x(bounds.get(2)), xs, y(bounds.get(2)), ys)
                    const upperLeft = findCorner(y(bounds.get(3)), ys, x(bounds.get(3)), xs)
                    return {
                        upperLeft,
                        upperRight,
                        lowerRight,
                        lowerLeft
                    }
                }

                function getViewAz(corners) {
                    const upperCenter = pointBetween(corners.upperLeft, corners.upperRight)
                    const lowerCenter = pointBetween(corners.lowerLeft, corners.lowerRight)
                    const slope = slopeBetween(lowerCenter, upperCenter)
                    const slopePerp = ee.Number(-1).divide(slope)
                    return expr('PI / 2 - atan(slopePerp)', {
                        slopePerp,
                        PI: Math.PI
                    })
                }

                function getViewZen(corners, maxZenith) {
                    const maxDistanceToSceneEdge = 1000000
                    const leftLine = toLine(corners.upperLeft, corners.lowerLeft)
                    const rightLine = toLine(corners.upperRight, corners.lowerRight)
                    const leftDistance = ee.FeatureCollection(leftLine).distance(maxDistanceToSceneEdge)
                    const rightDistance = ee.FeatureCollection(rightLine).distance(maxDistanceToSceneEdge)
                    return toRadians(expr(
                        '(rightDistance * maxZenith * 2) / (rightDistance + leftDistance) - maxZenith', {
                            leftDistance,
                            rightDistance,
                            maxZenith
                        }
                    ))
                }

                var corners = findCorners(image.geometry())
                const viewAz = getViewAz(corners)
                const viewZen = getViewZen(corners, maxZenith)
                return {
                    viewAz,
                    viewZen
                }
            }

            function getSunAngles(date) {
                // Ported from http://pythonfmask.org/en/latest/_modules/fmask/landsatangles.html
                const longDeg = ee.Image.pixelLonLat().select('longitude')
                const latRad = toRadians(ee.Image.pixelLonLat().select('latitude'))
                const jdp = ee.Image(ee.Number(date.getFraction('year')).float()).float()
                const jdpr = expr('jdp * 2 * PI', {
                    jdp,
                    PI: Math.PI
                }) // Julian Date Proportion in Radians
                const hourGMT = date.getRelative('second', 'day').divide(3600)
                const meanSolarTime = expr('hourGMT + longDeg / 15', {
                    hourGMT,
                    longDeg
                })
                const localSolarDiff = expr(
                    '(0.000075 + 0.001868 * cos(jdpr) - 0.032077 * sin(jdpr) ' +
                    '- 0.014615 * cos(2 * jdpr) - 0.040849 * sin(2 * jdpr)) ' +
                    '* 12 * 60 / PI', {
                        jdpr,
                        PI: Math.PI
                    }
                )
                const trueSolarTime = expr('meanSolarTime + localSolarDiff / 60 - 12', {
                    meanSolarTime,
                    localSolarDiff
                })
                const angleHour = toRadians(expr('trueSolarTime * 15', {
                    trueSolarTime
                }))
                const delta = expr(
                    '0.006918 - 0.399912 * cos(jdpr) + 0.070257 * sin(jdpr) - 0.006758 * cos(2 * jdpr) ' +
                    '+ 0.000907 * sin(2 * jdpr) - 0.002697 * cos(3 * jdpr) + 0.001480 * sin(3 * jdpr)', {
                        jdpr
                    }
                )
                const cosSunZen = expr('sin(latRad) * sin(delta) + cos(latRad) * cos(delta) * cos(angleHour)', {
                    latRad,
                    delta,
                    angleHour
                })
                const sunZen = expr('acos(cosSunZen)', {
                    cosSunZen
                })
                const sinSunAzSW = expr('cos(delta) * sin(angleHour) / sin(sunZen)', {
                    delta,
                    angleHour,
                    sunZen
                }).clamp(-1, 1)
                const cosSunAzSW = expr('(-cos(latRad) * sin(delta) + sin(latRad) * cos(delta) * cos(angleHour)) / sin(sunZen)', {
                    latRad,
                    delta,
                    angleHour,
                    sunZen
                })

                let sunAzSW = expr('asin(sinSunAzSW)', {
                    sinSunAzSW
                })
                sunAzSW = sunAzSW.where(
                    expr('cosSunAzSW <= 0', {
                        cosSunAzSW
                    }),
                    expr('PI - sunAzSW', {
                        sunAzSW,
                        PI: Math.PI
                    })
                )
                sunAzSW = sunAzSW.where(
                    expr('cosSunAzSW > 0 and sinSunAzSW <= 0', {
                        cosSunAzSW,
                        sinSunAzSW
                    }),
                    expr('2 * PI + sunAzSW', {
                        sunAzSW,
                        PI: Math.PI
                    })
                )

                const uncorrectedSunAz = expr('sunAzSW + PI', {
                    sunAzSW,
                    PI: Math.PI
                })
                const sunAz = uncorrectedSunAz
                    .where(
                        expr('uncorrectedSunAz > 2 * PI', {
                            uncorrectedSunAz,
                            PI: Math.PI
                        }),
                        expr('uncorrectedSunAz - 2 * PI', {
                            uncorrectedSunAz,
                            PI: Math.PI
                        })
                    )

                return {
                    sunAz,
                    sunZen
                }
            }

            function getSunZenOut(geometry) {
                // https://nex.nasa.gov/nex/static/media/publication/HLS.v1.0.UserGuide.pdf
                const centerLat = toRadians(ee.Number(geometry.centroid(30).coordinates().get(0)).float())
                return toRadians(
                    expr(
                        '31.0076 ' +
                        '- 0.1272 * centerLat ' +
                        '+ 0.01187 * pow(centerLat, 2) ' +
                        '+ 2.40E-05 * pow(centerLat, 3) ' +
                        '- 9.48E-07 * pow(centerLat, 4) ' +
                        '- 1.95E-09 * pow(centerLat, 5) ' +
                        '+ 6.15E-11 * pow(centerLat, 6)', {
                            centerLat
                        })
                )
            }

            function rossThick(sunZen, viewZen, relativeSunViewAz) {
                const cosPhaseAngle = getCosPhaseAngle(sunZen, viewZen, relativeSunViewAz)
                const phaseAngle = expr('acos(cosPhaseAngle)', {
                    cosPhaseAngle
                })
                return expr(
                    '((PI / 2 - phaseAngle) * cosPhaseAngle + sin(phaseAngle)) / (cos(sunZen) + cos(viewZen)) - PI / 4', {
                        phaseAngle,
                        cosPhaseAngle,
                        sunZen,
                        viewZen,
                        PI: Math.PI
                    }
                )
            }

            function liThin(sunZen, viewZen, relativeSunViewAz) {
                // From https://modis.gsfc.nasa.gov/data/atbd/atbd_mod09.pdf
                const sunZenPrime = getAnglePrime(sunZen)
                const viewZenPrime = getAnglePrime(viewZen)
                const cosPhaseAnglePrime = getCosPhaseAngle(sunZenPrime, viewZenPrime, relativeSunViewAz)
                const distance = expr(
                    'sqrt(pow(tan(sunZenPrime), 2) + pow(tan(viewZenPrime), 2) ' +
                    '- 2 * tan(sunZenPrime) * tan(viewZenPrime) * cos(relativeSunViewAz))', {
                        sunZenPrime,
                        viewZenPrime,
                        relativeSunViewAz,
                        h_b_ratio: 2
                    })
                const temp = expr('1/cos(sunZenPrime) + 1/cos(viewZenPrime)', {
                    sunZenPrime,
                    viewZenPrime
                })
                const cosT = expr(
                    'h_b_ratio * sqrt(pow(distance, 2) + pow(tan(sunZenPrime) * tan(viewZenPrime) * sin(relativeSunViewAz), 2)) / temp', {
                        distance,
                        sunZenPrime,
                        viewZenPrime,
                        relativeSunViewAz,
                        temp,
                        h_b_ratio: 2
                    }
                ).clamp(-1, 1)
                const t = expr('acos(cosT)', {
                    cosT
                })
                const overlap = expr('(1 / PI) * (t - sin(t) * cosT) * (temp)', {
                    t,
                    cosT,
                    temp,
                    PI: Math.PI
                }).min(0)
                return expr(
                    'overlap - temp + (1 / 2) * (1 + cos(cosPhaseAnglePrime)) * (1/cos(sunZenPrime)) * (1/cos(viewZenPrime))', {
                        overlap,
                        temp,
                        cosPhaseAnglePrime,
                        sunZenPrime,
                        viewZenPrime
                    }
                )
            }

            function getAnglePrime(angle) {
                const tanAnglePrime = expr('b_r_ratio * tan(angle)', {
                    'b_r_ratio': 1,
                    angle
                }).max(0)
                return expr('atan(tanAnglePrime)', {
                    tanAnglePrime
                })
            }

            function getCosPhaseAngle(sunZen, viewZen, relativeSunViewAz) {
                return expr(
                    'cos(sunZen) * cos(viewZen) + sin(sunZen) * sin(viewZen) * cos(relativeSunViewAz)', {
                        sunZen,
                        viewZen,
                        relativeSunViewAz
                    }
                ).clamp(-1, 1)
            }

            function adjustBands(image, kvol, kvol0, kgeo, kgeo0) {
                const COEFFICIENTS = {
                    'blue': {fiso: 0.0774, fgeo: 0.0079, fvol: 0.0372},
                    'green': {fiso: 0.1306, fgeo: 0.0178, fvol: 0.0580},
                    'red': {fiso: 0.1690, fgeo: 0.0227, fvol: 0.0574},
                    'nir': {fiso: 0.3093, fgeo: 0.0330, fvol: 0.1535},
                    'swir1': {fiso: 0.3430, fgeo: 0.0453, fvol: 0.1154},
                    'swir2': {fiso: 0.2658, fgeo: 0.0387, fvol: 0.0639}
                }

                return ee.Image(
                    Object.keys(COEFFICIENTS).map(function(bandName) {
                        const coefficients = COEFFICIENTS[bandName]
                        return applyCFactor(
                            image.select(bandName),
                            kvol,
                            kvol0,
                            kgeo,
                            kgeo0,
                            coefficients
                        )
                    })
                )
            }

            function applyCFactor(band, kvol, kvol0, kgeo, kgeo0, coefficients) {
                const brdf = getBrdf(kvol, kgeo, coefficients)
                const brdf0 = getBrdf(kvol0, kgeo0, coefficients)
                return expr('band * brdf0 / brdf', {
                    band,
                    brdf,
                    brdf0
                })
            }

            function getBrdf(kvol, kgeo, coefficients) {
                return expr('fiso + 3 * fvol * kvol + fgeo * kgeo', {
                    fiso: coefficients.fiso,
                    fgeo: coefficients.fgeo,
                    fvol: coefficients.fvol,
                    kvol,
                    kgeo
                })
            }

            function expr(expression, map) {
                return ee.Image().expression(expression, map)
            }

            function x(point) {
                return ee.Number(ee.List(point).get(0))
            }

            function y(point) {
                return ee.Number(ee.List(point).get(1))
            }

            function pointBetween(pointA, pointB) {
                return ee.Geometry.LineString([pointA, pointB]).centroid().coordinates()
            }

            function slopeBetween(pointA, pointB) {
                return ((y(pointA)).subtract(y(pointB))).divide((x(pointA)).subtract(x(pointB)))
            }

            function toLine(pointA, pointB) {
                return ee.Geometry.LineString([pointA, pointB])
            }

            function toRadians(image) {
                return image.multiply(Math.PI).divide(180)
            }
        }
    }
}

const histogramMatch = (target, reference, referenceScale, targetScale) => {
    reference = reference.clip(target.geometry())
    const bandNames = ['blue', 'green', 'red', 'nir']

    const getHistData = function (image, band, scale) {
        const histogram = image.reduceRegion({
            reducer: ee.Reducer.histogram({
                maxBuckets: Math.pow(2, 8)
            }),
            geometry: image.geometry(),
            scale,
            maxPixels: 1e9
        })
        // Get the list of DN values (x-axis of the histogram)
        const dnList = ee.List(ee.Dictionary(histogram.get(band)).get('bucketMeans'))
        // Get the list of Counts values (y-Axis of the histogram)
        const countsList = ee.List(ee.Dictionary(histogram.get(band)).get('histogram'))
        // Compute the cumulative sum of the counts
        const cumulativeCountsArray = ee.Array(countsList).accum({
            axis: 0
        })
        // The last element of the array is the total count, so extract it.
        const totalCount = cumulativeCountsArray.get([-1])
        // Divide each value by the total so that the values are between 0 and 1
        // This will be the cumulative probability at each DN
        const cumulativeProbabilities = cumulativeCountsArray.divide(totalCount)

        // Create a merged array with DN and cumulative probabilities
        const array = ee.Array.cat({
            arrays: [dnList, cumulativeProbabilities],
            axis: 1
        })

        // FeatureCollections give is a lot of flexibility such as charting, classification etc.
        // Convert the array into a feature collection with null geometries
        const fc = ee.FeatureCollection(array.toList().map(function (list) {
            return ee.Feature(null, {
                dn: ee.List(list).get(0),
                probability: ee.List(list).get(1)
            })
        }))
        return fc
    }

    const equalize = function (referenceImage, targetImage, band) {
        const referenceHistData = getHistData(referenceImage, band, referenceScale)
        const targetHistData = getHistData(targetImage, band, targetScale)

        const dnToProb = ee.Classifier.smileRandomForest(15)
            .setOutputMode('REGRESSION')
            .train({
                features: targetHistData,
                classProperty: 'probability',
                inputProperties: ['dn']
            })

        const probToDn = ee.Classifier.smileRandomForest(15)
            .setOutputMode('REGRESSION')
            .train({
                features: referenceHistData,
                classProperty: 'dn',
                inputProperties: ['probability']
            })

        // Now we can take the target image and get cumulative probability
        const targetImageProb = targetImage.select(band).rename('dn').classify(dnToProb, 'probability')
        const targetImageDn = targetImageProb.classify(probToDn, band)
        return targetImageDn
    }

    const match = function (referenceImage, targetImage, bandNames) {
        const matchedBands = bandNames.map(function (band) {
            return equalize(referenceImage, targetImage, band)
        })
        return ee.Image.cat(matchedBands)
    }

    return match(reference, target, bandNames).int16()
}

module.exports = {createReference, histogramMatch}
