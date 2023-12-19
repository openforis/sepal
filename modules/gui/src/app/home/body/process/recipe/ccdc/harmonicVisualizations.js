import {normalize} from '../../../../map/visParams/visParams'

const bandDefs = {
    VV: {amplitude: [40, 400], rmse: [150, 350]},
    VH: {amplitude: [30, 400], rmse: [150, 400]},
    ratio_VV_VH: {amplitude: [0, 12], rmse: [0, 30]},

    blue: {amplitude: [0, 500], rmse: [0, 500]},
    green: {amplitude: [0, 500], rmse: [0, 500]},
    red: {amplitude: [0, 700], rmse: [0, 700]},
    nir: {amplitude: [0, 1000], rmse: [0, 1000]},
    swir1: {amplitude: [0, 1800], rmse: [0, 1800]},
    swir2: {amplitude: [0, 1800], rmse: [0, 1800]},

    ndvi: {amplitude: [0, 3000], rmse: [0, 2500]},
    ndmi: {amplitude: [0, 5000], rmse: [0, 2000]},
    ndwi: {amplitude: [0, 3000], rmse: [0, 3000]},
    mndwi: {amplitude: [0, 5000], rmse: [0, 2000]},
    ndfi: {amplitude: [0, 10000], rmse: [0, 8500]},
    evi: {amplitude: [0, 10000], rmse: [0, 10000]},
    evi2: {amplitude: [0, 10000], rmse: [0, 6500]},
    savi: {amplitude: [0, 10000], rmse: [0, 4000]},
    nbr: {amplitude: [0, 5000], rmse: [0, 2000]},
    mvi: {amplitude: [0, 10000], rmse: [0, 4000]},
    ui: {amplitude: [0, 5000], rmse: [0, 2000]},
    ndbi: {amplitude: [0, 5000], rmse: [0, 2000]},
    ibi: {amplitude: [0, 5000], rmse: [0, 2000]},
    nbi: {amplitude: [0, 5000], rmse: [0, 2000]},
    ebbi: {amplitude: [0, 5000], rmse: [0, 2000]},
    bui: {amplitude: [0, 5000], rmse: [0, 2000]},
    kndvi: {amplitude: [0, 3000], rmse: [0, 2500]},

    wetness: {amplitude: [0, 1500], rmse: [0, 1500]},
    greenness: {amplitude: [0, 3000], rmse: [0, 1500]},
    brightness: {amplitude: [0, 3000], rmse: [0, 3000]}
}

export const toHarmonicVisualization = band => {
    if (!Object.keys(bandDefs).includes(band)) {
        return null
    }
    const phase = [-Math.PI, Math.PI]
    const {amplitude, rmse} = bandDefs[band]
    return normalize({
        type: 'hsv',
        bands: [`${band}_phase_1`, `${band}_amplitude_1`, `${band}_rmse`],
        baseBands: [band],
        min: [phase[0], amplitude[0], rmse[0]],
        max: [phase[1], amplitude[1], rmse[1]],
        inverted: [false, false, true]
    })
}
