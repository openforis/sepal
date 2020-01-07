const ee = require('@google/earthengine')

const calculateIndex = (image, indexName) => ({
    ndvi: toNdvi(image),
    ndmi: toNdmi(image),
    ndwi: toNdwi(image),
    mndwi: to_mndwi(image),
    evi: toEvi(image),
    evi2: toEvi2(image),
    savi: toSavi(image),
    nbr: toNbr(image),
    ui: toUi(image),
    ndbi: toNdbi(image),
    ibi: to_ibi(image),
    nbi: toNbi(image),
    ebbi: toEbbi(image),
    bui: toBui(image),
    ndfi: toNdfi(image),
}[indexName])

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
        const gv = [500, 900, 400, 6100, 3000, 1000]
        const shade = [0, 0, 0, 0, 0, 0]
        const npv = [1400, 1700, 2200, 3000, 5500, 3000]
        const soil = [2000, 3000, 3400, 5800, 6000, 5800]
        const cloud = [9000, 9600, 8000, 7800, 7200, 6500]
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
    return image.where(validImage, calculateNdfi())
}

const toEvi = (image, L = 1, C1 = 6, C2 = 7.5, G = 2.5) => {
    return evaluate({
        image,
        requiredBands: ['blue', 'red', 'nir'],
        expression: `${G} * ((nir - red) / (nir + ${C1} * red - ${C2} * blue + ${L}))`,
        name: 'evi'
    }
    )
}

const toEvi2 = image => {
    return evaluate({
        image,
        requiredBands: ['blue', 'red', 'nir'],
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

const to_ibi = (image, high_plant_cover = false, L = 0.5) => {
    ndbi = toNdbi(image)
    mndwi = to_mndwi(image)
    if (high_plant_cover) {
        ndvi = toNdvi(image)
        return evaluate({
            image: ndbi.addBands(ndvi).addBands(mndwi),
            requiredBands: ['ndbi', 'ndvi', 'mndwi'],
            expression: '(ndbi - (ndvi + mndwi) / 2) / (ndbi + (ndvi + mndwi) / 2)',
            name: 'ibi'
        })
    } else {
        savi = toSavi(image, L)
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
        expression: '(swir1 - nir) / 10 * sqrt(swir1 + thermal)',
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

module.exports = {calculateIndex}
