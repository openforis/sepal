const ee = require('#sepal/ee/ee')

const toNdvi = image =>
    evaluate({
        image,
        requiredBands: ['red', 'nir'],
        expression: '(nir - red) / (nir + red)',
        name: 'ndvi'
    })

const toNdmi = image =>
    evaluate({
        image,
        requiredBands: ['nir', 'swir1'],
        expression: '(nir - swir1) / (nir + swir1)',
        name: 'ndmi'
    })

const toNdwi = image =>
    evaluate({
        image,
        requiredBands: ['green', 'nir'],
        expression: '(green - nir) / (green + nir)',
        name: 'ndwi'
    })

const to_mndwi = image =>
    evaluate({
        image,
        requiredBands: ['green', 'swir1'],
        expression: '(green - swir1) / (green + swir1)',
        name: 'mndwi'
    })

const toNdfi = image => {
    const requiredBands = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
    const validImage = image.selectExisting(requiredBands).bandNames().length().eq(requiredBands.length)

    const calculateNdfi = () => {
        const gv = [.05, .09, .04, .61, .3, .1]
        const shade = [0, 0, 0, 0, 0, 0]
        const npv = [.14, .17, .22, .3, .55, .3]
        const soil = [.2, .3, .34, .58, .6, .58]
        const cloud = [.9, .96, .8, .78, .72, .65]
        const unmixed = image.selectOrDefault(requiredBands)
            .unmix({
                endmembers: [gv, shade, npv, soil, cloud],
                sumToOne: true,
                nonNegative: true
            }).rename(['gv', 'shade', 'npv', 'soil', 'cloud'])
        return unmixed
            .expression(
                '((i.gv / (1 - i.shade)) - (i.npv + i.soil)) / ((i.gv / (1 - i.shade)) + i.npv + i.soil)',
                {'i': unmixed}
            )
            .rename('ndfi')
            .float()
    }
    return ee.Image([]).when(validImage, calculateNdfi())
}

const toEvi = (image, L = 1, C1 = 6, C2 = 7.5, G = 2.5) => {
    return evaluate({
        image,
        requiredBands: ['blue', 'red', 'nir'],
        expression: `${G} * ((nir - red) / (nir + ${C1} * red - ${C2} * blue + ${L}))`,
        name: 'evi'
    })
}

const toEvi2 = image => {
    return evaluate({
        image,
        requiredBands: ['red', 'nir'],
        expression: '2.5 * (nir - red) / (nir + 2.4 * red + 1)',
        name: 'evi2'
    })
}

const toSavi = (image, L = 0.5) => {
    return evaluate({
        image,
        requiredBands: ['red', 'nir'],
        expression: `(nir - red) * (1 + ${L})/(nir + red + ${L})`,
        name: 'savi'
    })
}

const toNbr = image => {
    return evaluate({
        image,
        requiredBands: ['nir', 'swir2'],
        expression: '(nir - swir2) / (nir + swir2)',
        name: 'nbr'
    })
}

const toMvi = image => {
    return evaluate({
        image,
        requiredBands: ['green', 'nir', 'swir1'],
        expression: '0.1 * (nir - green) / abs(swir1 - green)',
        name: 'mvi'
    }).clamp(-1, 1)
}

const toUi = image => {
    return evaluate({
        image,
        requiredBands: ['nir', 'swir2'],
        expression: '(swir2 - nir) / (swir2 + nir)',
        name: 'ui'
    })
}

const toNdbi = image => {
    return evaluate({
        image,
        requiredBands: ['nir', 'swir1'],
        expression: '(swir1 - nir) / (swir1 + nir)',
        name: 'ndbi'
    })
}

const toIbi = (image, high_plant_cover = false, L = 0.5) => {
    const ndbi = toNdbi(image)
    const mndwi = to_mndwi(image)
    if (high_plant_cover) {
        const ndvi = toNdvi(image)
        return evaluate({
            image: ndbi.addBands(ndvi).addBands(mndwi),
            requiredBands: ['ndbi', 'ndvi', 'mndwi'],
            expression: '(ndbi - (ndvi + mndwi) / 2) / (ndbi + (ndvi + mndwi) / 2) / ',
            name: 'ibi'
        })
    } else {
        const savi = toSavi(image, L)
        return evaluate({
            image: ndbi.addBands(savi).addBands(mndwi),
            requiredBands: ['ndbi', 'savi', 'mndwi'],
            expression: '(ndbi - (savi + mndwi) / 2) / (ndbi + (savi + mndwi) / 2)',
            name: 'ibi'
        })
    }
}

const toNbi = image => {
    return evaluate({
        image,
        requiredBands: ['red', 'nir', 'swir1'],
        expression: 'red * swir1 / nir',
        name: 'nbi'
    })
}

const toEbbi = image => {
    return evaluate({
        image,
        requiredBands: ['nir', 'swir1', 'swir2', 'thermal'],
        expression: '(swir1 - nir) / (10 * sqrt(swir1 + thermal))',
        name: 'ebbi'
    })
}

const toBui = image => {
    return evaluate({
        image,
        requiredBands: ['red', 'swir1', 'swir2'],
        expression: '(red - swir1) / (red + swir1) + (swir2 - swir1) / (swir2 + swir1)',
        name: 'bui'
    })
}

const toKNdvi = image => {
    const sigma = 0.2
    const kernel = evaluate({
        image: image.addBands(ee.Image(sigma).rename('sigma')),
        requiredBands: ['red', 'nir', 'sigma'],
        expression: 'exp(-((nir-red)**2)/(2*sigma**2))',
        name: 'kernel'
    })
    return evaluate({
        image: kernel,
        requiredBands: ['kernel'],
        expression: '(1 - kernel) / (1 + kernel)',
        name: 'kndvi'
    })
}

const evaluate = ({image, requiredBands, expression, name}) => {
    const hasRequiredBands = image.selectExisting(requiredBands).bandCount().eq(requiredBands.length)
    const imageWithAllBands = image.selectOrDefault(requiredBands, ee.Image(0))
    const bandMap = requiredBands.reduce(
        (acc, band) => {
            acc[band] = imageWithAllBands.select(band)
            return acc
        },
        {}
    )
    const evaluated = ee.Image.expr(expression, bandMap).rename(name)
    return ee.Image([])
        .when(hasRequiredBands, evaluated)
}

const indexes = {
    ndvi: toNdvi,
    ndmi: toNdmi,
    ndwi: toNdwi,
    mndwi: to_mndwi,
    evi: toEvi,
    evi2: toEvi2,
    savi: toSavi,
    nbr: toNbr,
    mvi: toMvi,
    ui: toUi,
    ndbi: toNdbi,
    ibi: toIbi,
    nbi: toNbi,
    ebbi: toEbbi,
    bui: toBui,
    ndfi: toNdfi,
    kndvi: toKNdvi,
}

const calculateIndex = (image, indexName) => indexes[indexName]
    ? indexes[indexName](image.divide(10000))
    : ee.Image([])

const supportedIndexes = () => Object.keys(indexes)

module.exports = {calculateIndex, supportedIndexes}
