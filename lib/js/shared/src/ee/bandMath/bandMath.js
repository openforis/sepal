const {forkJoin, map, switchMap} = require('rxjs')
const imageFactory = require('#sepal/ee/imageFactory')
const _ = require('lodash')
const ee = require('#sepal/ee')

const bandMath = ({model}, {selection: selectedBands} = {selection: []}) => {
    const images = model.inputImagery.images
    const calculations = model.calculations.calculations
    const outputImages = model.outputBands.outputImages

    const evaluateFunction = (calculation, eeImageById) => {
        const sourceEEImage = ee.Image([
            calculation.usedBands.map(({imageId, name}) => {
                return eeImageById[imageId].select(name)
            })
        ])
        return sourceEEImage
            .reduce(ee.Reducer[calculation.reducer]())
            .rename(calculation.includedBands[0].name)
    }

    const evaluateExpression = (calculation, eeImageById) => {
        // TODO: Implement...
    }

    const getImage$ = () => {
        return forkJoin(images.reduce(
            (eeImage$ById, image) => {
                eeImage$ById[image.imageId] = imageFactory(image).getImage$()
                return eeImage$ById
            },
            {}
        )).pipe(
            map(eeImageById =>
                calculations.reduce(
                    (eeImageById, calculation) => {
                        const eeImage = calculation.type === 'FUNCTION'
                            ? evaluateFunction(calculation, eeImageById)
                            : evaluateExpression(calculation, eeImageById)
                        eeImageById[calculation.imageId] = eeImage
                        return eeImageById
                    },
                    eeImageById
                )
            ),
            map(eeImageById =>
                ee.Image(
                    outputImages.map(({imageId, outputBands}) =>
                        eeImageById[imageId].select(
                            outputBands.map(({name}) => name),
                            outputBands.map(({outputName}) => outputName)
                        )
                    )
                ).select(selectedBands?.length ? selectedBands : '.*')
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
