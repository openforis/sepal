const ee = require('#sepal/ee')
const {of} = require('rxjs')
const _ = require('lodash')
const {toGeometry} = require('#sepal/ee/aoi')

const imageCollectionAsset = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    const assetId = model.assetDetails.assetId
    const collection = ee.ImageCollection(assetId)
    const geometry = determineGeometry()

    return {
        getImage$() {
            return compose(
                collection,
                filterBounds,
                filterDate,
                filterCustomProperties,
                mask,
                select,
                createComposite,
                copyProperties,
                clip,
                toStream
            )
        },
        getBands$() {
            const bandNames = collection
                .merge(ee.ImageCollection([ee.Image([])]))
                .first()
                .bandNames()
            return ee.getInfo$(bandNames, 'asset band names')
        },
        getGeometry$() {
            return of(geometry)
        }
    }

    function determineGeometry() {
        return model.aoi.type === 'ASSET_BOUNDS'
            ? collection.geometry().bounds()
            : toGeometry(model.aoi)
    }

    function filterBounds(collection) {
        return model.aoi.type === 'ASSET_BOUNDS'
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
        // TODO: Implement...
        return collection
    }

    function mask(collection) {
        // TODO: Implement...
        return collection
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
            default : return collection.mosaic()
            }
        }
    }

    function clip(image) {
        return image.clip(geometry)
    }

    function copyProperties(image) {
        const firstImage = collection
            .merge(ee.ImageCollection([ee.Image([])]))
            .first()
        return ee.Image(
            image
                .copyProperties(firstImage)
                .copyProperties(collection)
        )
    }

    function toStream(image) {
        return of(image)
    }
}

const compose = (initial, ...functions) =>
    functions.reduce((acc, fun) => fun(acc), initial)

module.exports = imageCollectionAsset
