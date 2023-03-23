const ee = require('#sepal/ee')

function addHarmonicBands({harmonicDependents}) {
    return image => image.addBands(
        harmonicDependents.map(dependent =>
            calculateDependentBands(image.select(dependent))
        )
    )
}

function addHarmonics({geometry, harmonicDependents, fit}) {
    return collection => {
        const harmonicsWithFit = harmonicDependents.map(dependent =>
            calculateHarmonics(collection, dependent)
        )
        const harmonics = ee.Image(
            harmonicsWithFit.map(({harmonics}) => harmonics)
        ).clip(geometry)
        if (fit)
            collection = collection
                .map(image => image
                    .addBands([harmonicsWithFit.map(({fit}) => fit(image))], null, true)
                    .excludeBands('.*_t', '.*_constant', '.*_cos', '.*_sin')
                )
        return collection.set('harmonics', harmonics)
    }
}

const calculateDependentBands = dependentBand => {
    const dependent = ee.String(dependentBand.bandNames().get(0))
    const date = dependentBand.date()
    const t = ee.Image(
        date.difference(ee.Date('1970-01-01'), 'year')
    ).float().rename(dependent.cat('_t'))
    const constant = ee.Image.constant(1).rename(dependent.cat('_constant'))
    const timeRadians = t.multiply(2 * Math.PI)
    const cos = timeRadians.cos().rename(dependent.cat('_cos'))
    const sin = timeRadians.sin().rename(dependent.cat('_sin'))
    return t
        .addBands(constant)
        .addBands(cos)
        .addBands(sin)
}

const calculateHarmonics = (collection, dependent) => {
    const independents = ee.List([`${dependent}_constant`, `${dependent}_t`, `${dependent}_cos`, `${dependent}_sin`])
    const trend = collection
        .select(independents.add(dependent))
        .reduce(ee.Reducer.linearRegression({
            numX: independents.length(),
            numY: 1
        })) // 4x1 array image
    // Turn the array image into a multi-band image of coefficients
    const trendCoefficients = trend.select('coefficients')
        .arrayProject([0])
        .arrayFlatten([independents])
        .float()

    const constant = trendCoefficients.select([`${dependent}_constant`], [`${dependent}_const`])
    const t = trendCoefficients.select(`${dependent}_t`)
    const sin = trendCoefficients.select(`${dependent}_sin`)
    const cos = trendCoefficients.select(`${dependent}_cos`)
    const phase = sin.atan2(cos).rename(`${dependent}_phase`)
    const amplitude = sin.hypot(sin).rename(`${dependent}_amp`)

    const residuals = trend.select('residuals')
        .arrayProject([0])
        .arrayFlatten([['res']])
        .rename(`${dependent}_res`)

    const fit = image => {
        const fitted = image.select(independents)
            .multiply(trendCoefficients)
            .reduce('sum')
            .rename(`${dependent}_fit`)
        const residuals = image.select(dependent)
            .subtract(fitted)
            .rename(`${dependent}_res`)
        return fitted
            .addBands(residuals)
            .float()
    }

    const harmonics = phase
        .addBands(amplitude)
        .addBands(residuals)
        .addBands(constant)
        .addBands(t)
        .float()
    return {harmonics, fit}
}

module.exports = {addHarmonicBands, addHarmonics, calculateHarmonics}
