import _ from 'lodash'
import {map, of, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {validateEEImage} from '#sepal/ee/validate'

import {createFilter} from './filter.js'
import {maskImage} from './mask.js'

const NO_IMAGES = {
    userMessage: {
        message: 'All images have been filtered out. Update the recipe to ensure at least one image is included.',
        key: 'process.mosaic.error.noImages'
    },
    statusCode: 400
}

const imageCollectionAsset = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    const assetId = model.assetDetails.assetId
    const rawCollection = ee.ImageCollection(assetId)

    return {
        getImage$() {
            return geometry$().pipe(
                map(geometry => {
                    const collection = transformed(contributing(geometry))
                    const image = compose(
                        collection,
                        createComposite,
                        copyProperties,
                        i => clip(i, geometry)
                    )
                    return validateEEImage({valid: collection.limit(1).size(), image, error: NO_IMAGES})
                })
            )
        },
        // The bands getImage$() builds, established from its first contributing image: an assumption that the
        // others share its schema, which this cannot detect a violation of. Nothing is clipped and no properties
        // are copied, so an ASSET_BOUNDS recipe never computes its collection's geometry here, while execution
        // still does.
        getSchemaImage$() {
            return schemaImage$()
        },
        getBands$() {
            return schemaImage$().pipe(
                switchMap(image => ee.getInfo$(image.bandNames(), 'asset band names'))
            )
        },
        getGeometry$() {
            return geometry$()
        }
    }

    function schemaImage$() {
        const schemaGeometry$ = model.aoi?.type === 'ASSET_BOUNDS'
            ? of(null)
            : toGeometry$(model.aoi)
        return schemaGeometry$.pipe(
            map(geometry => {
                const collection = transformed(contributing(geometry).limit(1))
                return validateEEImage({valid: collection.size(), image: createComposite(collection), error: NO_IMAGES})
            })
        )
    }

    // The images execution composites, as its AOI, dates and property filters select them.
    function contributing(geometry) {
        return compose(
            rawCollection,
            c => filterBounds(c, geometry),
            filterDate,
            filterCustomProperties
        )
    }

    function transformed(collection) {
        return compose(collection, mask, select)
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
