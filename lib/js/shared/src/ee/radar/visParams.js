const getVisParams = (selectedBands, harmonicDependents, scale = 1) => {
    const bands = {
        VV: {range: [-20, 0]},
        VV_min: {range: [-25, 0]},
        VV_mean: {range: [-20, 0]},
        VV_median: {range: [-20, 0]},
        VV_max: {range: [-17, 10]},
        VV_stdDev: {range: [0, 5]},
        VV_CV: {range: [-6, 28]},
        VV_fitted: {range: [-22, 0]},
        VV_residuals: {range: [0, 2.4], stretch: [1, 0.5]},
        VV_t: {range: [-4, 4]},
        VV_phase: {range: [-3.14, 3.14]},
        VV_amplitude: {range: [0.5, 5]},
        VH: {range: [-25, -5]},
        VH_min: {range: [-34, -5]},
        VH_mean: {range: [-25, -5]},
        VH_median: {range: [-25, -5]},
        VH_max: {range: [-25, 2]},
        VH_stdDev: {range: [0, 6]},
        VH_fitted: {range: [-20, 2]},
        VH_residuals: {range: [0, 2.4], stretch: [1, 0.5]},
        VH_t: {range: [-4, 4]},
        VH_phase: {range: [-3.14, 3.14]},
        VH_amplitude: {range: [0.5, 5]},
        VH_CV: {range: [0, 35]},
        ratio_VV_median_VH_median: {range: [2, 16]},
        NDCV: {range: [-1, 1]},
        ratio_VV_VH: {range: [3, 14]},
        constant: {range: [-280, 215]},
        dayOfYear: {range: [0, 366], palette: '00FFFF, 000099'},
        daysFromTarget: {range: [0, 183], palette: '008000, FFFF00, FF0000'}
    }
    const validBands = selectedBands.every(band => Object.keys(bands).includes(band))
    if (!validBands)
        return null // TODO: Do this better
    const min = selectedBands.map(band => bands[band].range[0] * scale)
    const max = selectedBands.map(band => bands[band].range[1] * scale)
    const stretch = selectedBands.map(band => bands[band].stretch)
    const palette = selectedBands.length === 1
        ? selectedBands[0].palette
        : null
    const hsv = harmonicDependents.length > 0
    return {bands: selectedBands, min, max, stretch, palette, hsv}
}

module.exports = {getVisParams}
