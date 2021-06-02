const getVisParams = (selectedBands, harmonicDependents, scale = 1) => {
    const bands = {
        VV: {range: [-20, 0]},
        VV_min: {range: [-25, 0]},
        VV_mean: {range: [-20, 0]},
        VV_med: {range: [-20, 0]},
        VV_max: {range: [-17, 10]},
        VV_std: {range: [0, 5]},
        VV_cv: {range: [-6, 28]},
        VV_fit: {range: [-22, 0]},
        VV_res: {range: [0, 2.4], stretch: [1, 0.5]},
        VV_t: {range: [-4, 4]},
        VV_phase: {range: [-3.14, 3.14]},
        VV_amp: {range: [0.5, 5]},
        VH: {range: [-25, -5]},
        VH_min: {range: [-34, -5]},
        VH_mean: {range: [-25, -5]},
        VH_med: {range: [-25, -5]},
        VH_max: {range: [-25, 2]},
        VH_std: {range: [0, 6]},
        VH_fit: {range: [-20, 2]},
        VH_res: {range: [0, 2.4], stretch: [1, 0.5]},
        VH_t: {range: [-4, 4]},
        VH_phase: {range: [-3.14, 3.14]},
        VH_amp: {range: [0.5, 5]},
        VH_cv: {range: [0, 35]},
        ratio_VV_med_VH_med: {range: [2, 16]},
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
