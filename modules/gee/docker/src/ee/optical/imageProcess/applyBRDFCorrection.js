const ee = require('@google/earthengine')
const _ = require('lodash')
const gp = require('./geometryParser')

const expr = ee.Image.expr

const applyBRDFCorrection = ({maxZenith}) =>
    image => {
        const corners = findCorners(image.geometry()) // [TODO] it actually expects track
        const viewAz = getViewAz(corners)
        const viewZen = getViewZen(corners, maxZenith)
        const {sunAz, sunZen} = getSunAngles(image.date())
        const sunZenOut = getSunZenOut(image.geometry())
        const relativeSunViewAz = expr('sunAz - viewAz', {sunAz, viewAz})
        const kvol = getRossThick(sunZen, viewZen, relativeSunViewAz)
        const kvol0 = getRossThick(sunZenOut, 0, 0)
        const kgeo = liThin(sunZen, viewZen, relativeSunViewAz)
        const kgeo0 = liThin(sunZenOut, 0, 0)
        return image.addBandsReplace(
            adjustBands({image, kvol, kvol0, kgeo, kgeo0})
        )
    }

const getViewAz = corners => {
    const upperCenter = gp.pointBetween(corners.upperLeft, corners.upperRight)
    const lowerCenter = gp.pointBetween(corners.lowerLeft, corners.lowerRight)
    const slope = gp.slopeBetween(lowerCenter, upperCenter)
    const slopePerp = ee.Number(-1).divide(slope)
    return expr('PI/2 - atan(slopePerp)', {slopePerp})
}

const getViewZen = (corners, maxZenith) => {
    const maxDistanceToSceneEdge = 1000000
    const leftLine = gp.toLine(corners.upperLeft, corners.lowerLeft)
    const rightLine = gp.toLine(corners.upperRight, corners.lowerRight)
    const leftDistance = ee.FeatureCollection(leftLine).distance(maxDistanceToSceneEdge)
    const rightDistance = ee.FeatureCollection(rightLine).distance(maxDistanceToSceneEdge)
    return expr(
        '(rightDistance * maxZenith * 2) / (rightDistance + leftDistance) - maxZenith',
        {leftDistance, rightDistance, maxZenith}
    ).toRadians()
}

const getSunAngles = date => {
    // Ported from http://pythonfmask.org/en/latest/_modules/fmask/landsatangles.html
    const longDeg = ee.Image.pixelLonLat().select('longitude')
    const latRad = ee.Image.pixelLonLat().select('latitude').toRadians()
    const jdp = ee.Image(ee.Number(date.getFraction('year')).float()).float()
    const jdpr = expr('jdp * 2 * PI', {jdp}) // Julian Date Proportion in Radians
    const hourGMT = date.getRelative('second', 'day').divide(3600)
    const meanSolarTime = expr('hourGMT + longDeg / 15', {hourGMT, longDeg})
    const localSolarDiff = expr(
        `(0.000075 + 0.001868 * cos(jdpr) - 0.032077 * sin(jdpr)
                - 0.014615 * cos(2 * jdpr) - 0.040849 * sin(2 * jdpr))
                * 12 * 60 / PI`,
        {jdpr}
    )
    const trueSolarTime = expr('meanSolarTime + localSolarDiff / 60 - 12', {meanSolarTime, localSolarDiff})
    const angleHour = expr('trueSolarTime * 15', {trueSolarTime}).toRadians()
    const delta = expr(
        `0.006918 - 0.399912 * cos(jdpr) + 0.070257 * sin(jdpr) - 0.006758 * cos(2 * jdpr)
                + 0.000907 * sin(2 * jdpr) - 0.002697 * cos(3 * jdpr) + 0.001480 * sin(3 * jdpr)`,
        {jdpr}
    )
    const cosSunZen = expr('sin(latRad) * sin(delta) + cos(latRad) * cos(delta) * cos(angleHour)', {latRad, delta, angleHour})
    const sunZen = expr('acos(cosSunZen)', {cosSunZen})
    const sinSunAzSW = expr('cos(delta) * sin(angleHour) / sin(sunZen)', {delta, angleHour, sunZen}).clamp(-1, 1)
    const cosSunAzSW = expr('(-cos(latRad) * sin(delta) + sin(latRad) * cos(delta) * cos(angleHour)) / sin(sunZen)', {latRad, delta, angleHour, sunZen})

    const sunAzSW = expr('asin(sinSunAzSW)', {sinSunAzSW})
        .compose(
            sunAzSW => sunAzSW.where(
                expr('cosSunAzSW <= 0', {cosSunAzSW}),
                expr('PI - sunAzSW', {sunAzSW})
            ),
            sunAzSW => sunAzSW.where(
                expr('cosSunAzSW > 0 and sinSunAzSW <= 0', {cosSunAzSW, sinSunAzSW}),
                expr('2 * PI + sunAzSW', {sunAzSW})
            )
        )

    const uncorrectedSunAz = expr('sunAzSW + PI', {sunAzSW})
    const sunAz = uncorrectedSunAz
        .where(
            expr('uncorrectedSunAz > 2 * PI', {uncorrectedSunAz}),
            expr('uncorrectedSunAz - 2 * PI', {uncorrectedSunAz})
        )

    return {sunAz, sunZen}
}

const getSunZenOut = geometry => {
    // https://nex.nasa.gov/nex/static/media/publication/HLS.v1.0.UserGuide.pdf
    const centerLat = ee.Number(geometry.centroid(30).coordinates().get(0)).float().toRadians()
    return expr(
        `31.0076
            - 0.1272 * centerLat
            + 0.01187 * pow(centerLat, 2)
            + 2.40E-05 * pow(centerLat, 3)
            - 9.48E-07 * pow(centerLat, 4)
            - 1.95E-09 * pow(centerLat, 5)
            + 6.15E-11 * pow(centerLat, 6)`,
        {centerLat})
        .toRadians()
}

const getRossThick = (sunZen, viewZen, relativeSunViewAz) => {
    const cosPhaseAngle = getCosPhaseAngle(sunZen, viewZen, relativeSunViewAz)
    const phaseAngle = expr('acos(cosPhaseAngle)', {cosPhaseAngle})
    return expr(
        '((PI/2 - phaseAngle) * cosPhaseAngle + sin(phaseAngle)) / (cos(sunZen) + cos(viewZen)) - PI/4',
        {phaseAngle, cosPhaseAngle, sunZen, viewZen}
    )
}

const liThin = (sunZen, viewZen, relativeSunViewAz) => {
    // From https://modis.gsfc.nasa.gov/data/atbd/atbd_mod09.pdf
    const sunZenPrime = getAnglePrime(sunZen)
    const viewZenPrime = getAnglePrime(viewZen)
    const cosPhaseAnglePrime = getCosPhaseAngle(sunZenPrime, viewZenPrime, relativeSunViewAz)
    const distance = expr(
        `sqrt(pow(tan(sunZenPrime), 2) + pow(tan(viewZenPrime), 2) 
            - 2 * tan(sunZenPrime) * tan(viewZenPrime) * cos(relativeSunViewAz))`,
        {sunZenPrime, viewZenPrime, relativeSunViewAz, h_b_ratio: 2})
    const temp = expr('1/cos(sunZenPrime) + 1/cos(viewZenPrime)', {sunZenPrime, viewZenPrime})
    const cosT = expr(
        'h_b_ratio * sqrt(pow(distance, 2) + pow(tan(sunZenPrime) * tan(viewZenPrime) * sin(relativeSunViewAz), 2)) / temp',
        {distance, sunZenPrime, viewZenPrime, relativeSunViewAz, temp, h_b_ratio: 2}
    ).clamp(-1, 1)
    const t = expr('acos(cosT)', {cosT})
    const overlap = expr('(1/PI) * (t - sin(t) * cosT) * (temp)', {t, cosT, temp}).min(0)
    return expr(
        'overlap - temp + (1/2) * (1 + cos(cosPhaseAnglePrime)) * (1/cos(sunZenPrime)) * (1/cos(viewZenPrime))',
        {overlap, temp, cosPhaseAnglePrime, sunZenPrime, viewZenPrime}
    )
}

const getAnglePrime = angle => {
    const tanAnglePrime = expr('b_r_ratio * tan(angle)', {'b_r_ratio': 1, angle}).max(0)
    return expr('atan(tanAnglePrime)', {tanAnglePrime})
}

const getCosPhaseAngle = (sunZen, viewZen, relativeSunViewAz) =>
    expr(
        'cos(sunZen) * cos(viewZen) + sin(sunZen) * sin(viewZen) * cos(relativeSunViewAz)',
        {sunZen, viewZen, relativeSunViewAz}
    ).clamp(-1, 1)

const adjustBands = ({image, kvol, kvol0, kgeo, kgeo0}) => {
    const coefficientsByBand = {
        'blue': {fiso: 0.0774, fgeo: 0.0079, fvol: 0.0372},
        'green': {fiso: 0.1306, fgeo: 0.0178, fvol: 0.0580},
        'red': {fiso: 0.1690, fgeo: 0.0227, fvol: 0.0574},
        'nir': {fiso: 0.3093, fgeo: 0.0330, fvol: 0.1535},
        'swir1': {fiso: 0.3430, fgeo: 0.0453, fvol: 0.1154},
        'swir2': {fiso: 0.2658, fgeo: 0.0387, fvol: 0.0639}
    }
        
    return ee.Image(
        _.map(coefficientsByBand, (coefficients, bandName) =>
            applyCFactor({band: image.select(bandName), kvol, kvol0, kgeo, kgeo0, coefficients}).rename(bandName)
        )
    )
}

const applyCFactor = ({band, kvol, kvol0, kgeo, kgeo0, coefficients}) => {
    const brdf = getBrdf(kvol, kgeo, coefficients)
    const brdf0 = getBrdf(kvol0, kgeo0, coefficients)
    return expr(
        'band * brdf0 / brdf',
        {band, brdf, brdf0}
    )
}

const getBrdf = (kvol, kgeo, coefficients) =>
    expr(
        'fiso + 4 * fvol * kvol + fgeo * kgeo',
        {...coefficients, kvol, kgeo}
    )

const findCorners = track => {
    // const track = dataSetSpec.track(i)
    const bounds = ee.List(track.bounds().coordinates().get(0))
    const coords = ee.List(track.coordinates().get(0))
    const xs = coords.map(gp.x)
    const ys = coords.map(gp.y)

    const findCorner = (targetValue, values, otherTargetValue, otherValues) => {
        const featureCollection = ee.FeatureCollection(
            coords.zip(values).zip(otherValues).map(element => {
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
    const lowerLeft = findCorner(gp.x(bounds.get(0)), xs, gp.y(bounds.get(0)), ys)
    const lowerRight = findCorner(gp.y(bounds.get(1)), ys, gp.x(bounds.get(1)), xs)
    const upperRight = findCorner(gp.x(bounds.get(2)), xs, gp.y(bounds.get(2)), ys)
    const upperLeft = findCorner(gp.y(bounds.get(3)), ys, gp.x(bounds.get(3)), xs)
    return {
        upperLeft,
        upperRight,
        lowerRight,
        lowerLeft
    }
}

module.exports = applyBRDFCorrection
