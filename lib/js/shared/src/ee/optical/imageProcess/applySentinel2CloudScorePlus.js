const applySentinel2CloudScorePlus = (image, {sentinel2CloudScorePlusBand, sentinel2CloudScorePlusMaxCloudProbability}) => {
    return image.select(sentinel2CloudScorePlusBand)
        .lt(1 - sentinel2CloudScorePlusMaxCloudProbability / 100)
        .rename('cloud')
}

module.exports = applySentinel2CloudScorePlus
