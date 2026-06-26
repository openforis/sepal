const applySentinel2CloudProbability = (image, {sentinel2CloudProbabilityMaxCloudProbability}) => {
    return image.select('probability')
        .gt(sentinel2CloudProbabilityMaxCloudProbability)
        .rename('cloud')
}

export default applySentinel2CloudProbability
