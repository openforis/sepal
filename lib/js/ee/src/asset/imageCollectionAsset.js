import _ from 'lodash'
import {map, of} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {validateEEImage} from '#sepal/ee/validate'

import {createFilter} from './filter.js'
import {maskImage} from './mask.js'

const imageCollectionAsset = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    const assetId = model.assetDetails.assetId
    const rawCollection = ee.ImageCollection(assetId)

    return {
        getImage$() {
            return geometry$().pipe(
                map(geometry => {
                    const collection = compose(
                        rawCollection,
                        c => filterBounds(c, geometry),
                        filterDate,
                        filterCustomProperties,
                        mask,
                        select
                    )
                    const image = compose(
                        collection,
                        createComposite,
                        copyProperties,
                        i => clip(i, geometry)
                    )
                    return validateEEImage({
                        valid: collection.limit(1).size(),
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
            return geometry$()
        }
    }

    // ASSET_BOUNDS derives its geometry from the source collection itself; every other aoi is resolved.
    function geometry$() {
        return model.aoi?.type === 'ASSET_BOUNDS'
            ? of(rawCollection.geometry().bounds())
            : toGeometry$(model.aoi)
    }

    function filterBounds(collection, geometry) {
        return geometry && model.aoi?.type !== 'ASSET_BOUNDS'
            ? collection.filterBounds(geometry)
            : collection
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

    function clip(image, geometry) {
        return geometry
            ? image.clip(geometry)
            : image
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

export default imageCollectionAsset
