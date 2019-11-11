const toMosaic = ({
    region,
    collection,
    filters,
    compose
}) => {
    return collection.median().clip(region)
}

module.exports = {toMosaic}
