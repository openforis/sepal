const ee = require('#sepal/ee')
const {map, of} = require('rxjs')
const _ = require('lodash')
const {maskImage} = require('./mask')
const {createFilter} = require('./filter')
const {toGeometry$} = require('#sepal/ee/aoi')
const {validateEEImage} = require('#sepal/ee/validate')

const imageCollectionAsset = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    const assetId = model.assetDetails.assetId
    const rawCollection = ee.ImageCollection(assetId)

    return {
        getImage$() {
            return determineGeometry$().pipe(
                map(geometry => {
                    const collection = compose(
                        rawCollection,
                        filterBounds(geometry),
                        filterDate,
                        filterCustomProperties,
                        mask,
                        select
                    )
                    const image = compose(
                        collection,
                        createComposite,
                        copyProperties,
                        clip(geometry)
                    )
                    return validateEEImage({
                        valid: collection.first(),
                        image,
                        error: {
                            userMessage: {
                                message: 'All images have been filtered out. Update the recipe to ensure at least one image is included.',
                                key: 'process.mosaic.error.noImages'
                            },
                            statusCode: 400
                        }
                    })
                })
            )

        },
        getBands$() {
            const bandNames = rawCollection
                .merge(ee.ImageCollection([ee.Image([])]))
                .first()
                .bandNames()
            return ee.getInfo$(bandNames, 'asset band names')
        },
        getGeometry$() {
            return determineGeometry$()
        }
    }

    function determineGeometry$() {
        return model.aoi.type === 'ASSET_BOUNDS'
            ? of(rawCollection.geometry().bounds())
            : toGeometry$(model.aoi)
    }

    function filterBounds(geometry) {
        return collection =>
            model.aoi.type === 'ASSET_BOUNDS'
                ? collection
                : collection.filterBounds(geometry)
    }

    function filterDate(collection) {
        const {type, fromDate, toDate} = model.dates
        return type !== 'ALL_DATES' && fromDate && toDate
            ? collection.filterDate(fromDate, toDate)
            : collection
    }

    function filterCustomProperties(collection) {
        const {filter: {filtersEntries} = {}} = model
        return filtersEntries
            ? collection.filter(
                createFilter(filtersEntries)
            )
            : collection
    }

    function mask(collection) {
        const {mask: {constraintsEntries} = {constraintsEntries: []}} = model

        const maskCollection = () =>
            collection.map(image => maskImage(constraintsEntries, image))

        return constraintsEntries.length
            ? maskCollection()
            : collection
    }

    function select(collection) {
        return selectedBands.length
            ? collection.select(selectedBands)
            : collection
    }

    function createComposite(collection) {
        const bandNames = collection
            .merge(ee.ImageCollection([ee.Image([])]))
            .first()
            .bandNames()
        return reduce(collection.select(bandNames))

        function reduce(collection) {
            switch(model.composite?.type) {
            case 'MEDIAN': return collection.median()
            case 'MEAN': return collection.mean()
            case 'MIN': return collection.min()
            case 'MAX': return collection.max()
            case 'SD': return collection.reduce(ee.Reducer.stdDev()).rename(bandNames)
            case 'MODE': return collection.mode()
            default : return collection.mosaic()
            }
        }
    }

    function clip(geometry) {
        return image => image.clip(geometry)
    }

    function copyProperties(image) {
        const firstImage = rawCollection
            .merge(ee.ImageCollection([ee.Image([])]))
            .first()
        return ee.Image(
            image
                .copyProperties(firstImage)
                .copyProperties(rawCollection)
        )
    }
}

const compose = (initial, ...functions) =>
    functions.reduce((acc, fun) => fun(acc), initial)

module.exports = imageCollectionAsset
