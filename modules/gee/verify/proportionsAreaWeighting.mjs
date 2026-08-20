import ee from '#sepal/ee/ee'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {toAreaWeightedProportions} from '#gee/jobs/ee/samplingDesign/areaWeightedProportions'
import {weightedAreaSums} from '#gee/jobs/ee/samplingDesign/weightedAreaSums'

const cb = op => new Promise((res, rej) => op((r, e) => e ? rej(e) : res(r)))
const evaluate = v => new Promise((res, rej) => v.evaluate((r, e) => e ? rej(e) : res(r)))
const assert = (c, m) => {
    if (!c) {
        throw new Error(m)
    }
}
const relative = (value, reference) => Math.abs(value - reference) / Math.abs(reference)

const CRS = 'EPSG:4326'
const SCALE = 10000
const MID_LON = 30.25
const WEST = 1
const EAST = 2

// A tall, narrow strip in a geographic CRS, so pixel area falls off as cos(latitude) across it and the area
// weighting has something to do. Roughly 5 x 670 pixels at 10 km - trivial to compute, wide enough that a
// weighted mean and an unweighted one cannot be confused for each other.
const regionOf = () => ee.Geometry.Rectangle([30, 0, 30.5, 60], CRS, false)

// Two strata split by longitude, each spanning the full latitude range, and a probability of 1 above a
// latitude that DIFFERS per stratum. Strata that expect different values make a mis-grouping visible; a
// symmetric fixture would pass with the groups swapped.
const fixture = () => {
    const lonLat = ee.Image.pixelLonLat()
    const lon = lonLat.select('longitude')
    const lat = lonLat.select('latitude')
    const threshold = lon.gt(MID_LON).multiply(-15).add(45)
    return {
        stratum: lon.gt(MID_LON).add(1).toInt().rename('stratum'),
        indicator: lat.gt(threshold),
        pixelArea: ee.Image.pixelArea()
    }
}

// Independently derived, not recorded from a run. Area weight is proportional to cos(latitude), so over a
// latitude band the weighted mean of an indicator is the ratio of the integrals of cos:
//   weighted(a..b within 0..60) = (sin b - sin a) / (sin 60 - sin 0)
// while the UNWEIGHTED mean is the plain fraction of latitude rows, (b - a) / 60. The two differ by ~27% for
// the western stratum, so a graph that summed probability without pixelArea cannot pass this.
const sinDegrees = degrees => Math.sin(degrees * Math.PI / 180)
const EXPECTED = {
    [WEST]: {
        weighted: (sinDegrees(60) - sinDegrees(45)) / sinDegrees(60),
        unweighted: (60 - 45) / 60
    },
    [EAST]: {
        weighted: (sinDegrees(60) - sinDegrees(30)) / sinDegrees(60),
        unweighted: (60 - 30) / 60
    }
}

// Half a pixel row is 0.045 degrees at both the stratum boundary and the region edges, which is worth ~0.4% on
// the observed runs. 1% covers that with room to spare and is still an order of magnitude tighter than the 27%
// the weighting itself is worth, which is the gap that carries the discriminating power.
const ANALYTIC_TOLERANCE = 0.01
// The oracle reduces the same pixels a different way, so only summation order separates the two.
const ORACLE_TOLERANCE = 1e-6

// Deliberately NOT the production reducer: masked single sums, no grouping and no combined reducer. Matching
// numbers therefore mean the grouped reducer partitioned and summed correctly, not that one graph equals itself.
const oracleOf = ({stratum, indicator, pixelArea}, region) => k => {
    const mask = stratum.eq(k)
    const reduce = (image, reducer) => image.updateMask(mask).reduceRegion({
        reducer, geometry: region, scale: SCALE, crs: CRS, maxPixels: 1e13
    })
    return ee.Dictionary({
        weighted: reduce(indicator.multiply(pixelArea).rename('w'), ee.Reducer.sum()).get('w'),
        area: reduce(pixelArea.rename('a'), ee.Reducer.sum()).get('a'),
        unweighted: reduce(indicator.rename('u'), ee.Reducer.mean()).get('u')
    })
}

const sumsFor = ({stratum, indicator}, region, mode) => weightedAreaSums({
    eeGeometry: region,
    eeStratification: stratum,
    eeProbability: mode === 'CATEGORICAL'
        ? indicator.add(1).toInt().rename('class')
        : indicator.toDouble().rename('probability'),
    stratificationBand: 'stratum',
    probabilityBand: mode === 'CATEGORICAL' ? 'class' : 'probability',
    mode,
    targetClass: 2,
    scale: SCALE,
    crs: CRS
})

const checkGroups = (groups, oracles, mode) => {
    assert(Array.isArray(groups), `${mode}: reduceRegion returned no groups list`)
    assert(groups.length === 2, `${mode}: expected 2 groups, got ${groups.length}`)
    const proportions = toAreaWeightedProportions(groups)
    return groups.map((group, index) => {
        const keys = Object.keys(group).sort()
        assert(
            keys.join(',') === 'area,stratum,weighted',
            `${mode}: group carries [${keys}], expected [area,stratum,weighted]`
        )
        const stratum = group.stratum
        const oracle = oracles[stratum]
        const expected = EXPECTED[stratum]
        assert(oracle, `${mode}: unexpected stratum ${stratum}`)
        assert(
            relative(group.weighted, oracle.weighted) < ORACLE_TOLERANCE,
            `${mode}: stratum ${stratum} weighted ${group.weighted} != oracle ${oracle.weighted}`
        )
        assert(
            relative(group.area, oracle.area) < ORACLE_TOLERANCE,
            `${mode}: stratum ${stratum} area ${group.area} != oracle ${oracle.area}`
        )
        const proportion = proportions[index].probability
        assert(
            proportions[index].stratum === stratum,
            `${mode}: proportions reordered stratum ${stratum}`
        )
        assert(
            relative(proportion, expected.weighted) < ANALYTIC_TOLERANCE,
            `${mode}: stratum ${stratum} proportion ${proportion} != analytic ${expected.weighted}`
        )
        // The whole point of the weighting: an unweighted mean over these pixels is a different number, and
        // the graph must land on the weighted one.
        assert(
            relative(proportion, oracle.unweighted) > 0.1,
            `${mode}: stratum ${stratum} proportion ${proportion} is indistinguishable from the unweighted mean ${oracle.unweighted}`
        )
        return {
            stratum,
            weighted: group.weighted,
            area: group.area,
            proportion,
            analyticProportion: expected.weighted,
            unweightedMean: oracle.unweighted,
            analyticUnweightedMean: expected.unweighted
        }
    })
}

const main = async () => {
    await cb(c => ee.data.authenticateViaPrivateKey(serviceAccountCredentials, c, e => c(null, e)))
    await cb(c => ee.initialize(null, null, c, e => c(null, e), null, googleProjectId))
    ee.setMaxRetries(0)

    const region = regionOf()
    const images = fixture()
    const oracle = oracleOf(images, region)

    const {probability, categorical, oracles} = await evaluate(ee.Dictionary({
        probability: sumsFor(images, region, 'PROBABILITY'),
        categorical: sumsFor(images, region, 'CATEGORICAL'),
        oracles: ee.Dictionary({[WEST]: oracle(WEST), [EAST]: oracle(EAST)})
    }))

    const results = {
        probability: checkGroups(probability.groups, oracles, 'PROBABILITY'),
        categorical: checkGroups(categorical.groups, oracles, 'CATEGORICAL')
    }
    // Both modes reduce the same indicator, so they must agree exactly; a difference means one branch of the
    // mode split builds a different image than it claims to.
    results.probability.forEach(({stratum, proportion}, index) => {
        const other = results.categorical[index]
        assert(
            other.stratum === stratum && relative(proportion, other.proportion) < ORACLE_TOLERANCE,
            `PROBABILITY and CATEGORICAL disagree on stratum ${stratum}: ${proportion} vs ${other.proportion}`
        )
    })

    console.log(JSON.stringify({checkpoint: 'PROPORTIONS_AREA_WEIGHTING', status: 'PASS', ...results}, null, 2))
}

main().catch(error => {
    console.error(JSON.stringify({checkpoint: 'PROPORTIONS_AREA_WEIGHTING', status: 'FAIL', error: String(error)}))
    process.exitCode = 1
})
