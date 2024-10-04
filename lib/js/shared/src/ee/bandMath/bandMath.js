const {map, of, switchMap, zip} = require('rxjs')
const imageFactory = require('#sepal/ee/imageFactory')
const _ = require('lodash')
const ee = require('#sepal/ee')

const bandMath =
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
                map(eeImages =>
                    ee.Image(eeImages)
                )
            )
        }

        return {
            getImage$,
            getBands$() {
                return getImage$().pipe(
                    switchMap(image =>
                        ee.getInfo$(image.bandNames(), 'bandMath band names')
                    )
                )
            },
            getGeometry$() {
                return imageFactory(images[0]).getGeometry$()
            }
        }
    }

module.exports = bandMath
