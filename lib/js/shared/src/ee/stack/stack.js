const {map, of, switchMap, zip} = require('rxjs')
const imageFactory = require('#sepal/ee/imageFactory')
const _ = require('lodash')
const ee = require('#sepal/ee')

const stack =
    ({
        model: {
            inputImagery: {images},
            bandNames: {bandNames}
        }
    },
    {selection: selectedBands} = {selection: []}
    ) => {
        const getImage$ = () => {
            return zip(
                ...images.map(image => {
                    const bands = bandNames.find(({imageId}) => imageId === image.imageId).bands
                    const filteredBands = selectedBands.length
                        ? bands.filter(({outputName}) => selectedBands.includes(outputName))
                        : bands
                    
                    const originalNames = filteredBands.map(({originalName}) => originalName)
                    const outputNames = filteredBands.map(({outputName}) => outputName)
                    return filteredBands.length
                        ? imageFactory(image, {selection: originalNames}).getImage$().pipe(
                            map(eeImage => eeImage.select(originalNames, outputNames))
                        )
                        : of(ee.Image([]))
                })
            ).pipe(
                map(eeImages => {
                    const image = ee.Image(eeImages)
                    const boundedGeometries = ee.List(eeImages)
                        .map(image => ee.Image(image).geometry(), true)
                        .map(geometry => ee.Algorithms.If(
                            ee.Geometry(geometry).isUnbounded(),
                            null,
                            geometry
                        ), true)
                    return ee.Image(
                        ee.Algorithms.If(
                            boundedGeometries.size(),
                            image.clip(
                                boundedGeometries.iterate(
                                    (geometry, acc) => ee.Geometry(acc).union(ee.Geometry(geometry), 1),
                                    boundedGeometries.get(0)
                                )
                            ),
                            image
                        )
                    )
                })
            )
        }

        return {
            getImage$,
            getBands$() {
                return getImage$().pipe(
                    switchMap(image =>
                        ee.getInfo$(image.bandNames(), 'stack band names')
                    )
                )
            },
            getGeometry$() {
                return imageFactory(images[0]).getGeometry$()
            }
        }
    }

module.exports = stack
