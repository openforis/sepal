import {map, of, zip} from 'rxjs'

import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {stackBandCorrespondence, stackOutputNames} from '#sepal/recipe/type/stack'

const stack =
    ({model}, {selection: selectedBands} = {selection: []}) => {
        const getImage$ = () => {
            return zip(
                ...stackBandCorrespondence(model).map(({image, bands}) => {
                    if (!bands) {
                        throw new Error(`Stack input ${image.imageId} maps no bands`)
                    }
                    const filteredBands = selectedBands.length
                        ? bands.filter(({outputName}) => selectedBands.includes(outputName))
                        : bands
                    
                    const originalNames = filteredBands.map(({originalName}) => originalName)
                    const outputNames = filteredBands.map(({outputName}) => outputName)
                    return filteredBands.length
                        ? imageFactory(image, withOutputBands({selection: originalNames})).getImage$().pipe(
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
            // The declaration's output names, read from the mapping alone.
            getBands$() {
                return of(stackOutputNames(model))
            },
            getGeometry$() {
                return imageFactory(model.inputImagery.images[0]).getGeometry$()
            }
        }
    }

export default stack
