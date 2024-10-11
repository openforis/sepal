const {forkJoin, map, switchMap} = require('rxjs')
const imageFactory = require('#sepal/ee/imageFactory')
const _ = require('lodash')
const ee = require('#sepal/ee')

const bandMath = ({model}, {selection: selectedBands} = {selection: []}) => {
    const images = model.inputImagery.images
    const calculations = model.calculations.calculations
    const allImages = [...images, ...calculations]
    const outputImages = model.outputBands.outputImages

    const evaluateFunction = (calculation, eeImageById) => {
        const sourceEEImage = ee.Image([
            calculation.usedBands.map(({imageId, name}) => {
                return eeImageById[imageId].select(name)
            })
        ])
        return sourceEEImage
            .reduce(ee.Reducer[calculation.reducer]())
    }

    const evaluateExpression = (calculation, eeImageById) => {
        const eeImageByName = _.mapKeys(eeImageById, (eeImage, imageId) =>
            allImages.find(image => image.imageId === imageId).name
        )
        return ee.Image()
            .expression(calculation.expression, {
                E: Math.E,
                LN10: Math.LN10,
                LN2: Math.LN2,
                LOG10E: Math.LOG10E,
                LOG2E: Math.LOG2E,
                PI: Math.PI,
                SQRT1_2: Math.SQRT1_2,
                SQRT2: Math.SQRT2,
                ...eeImageByName
            })
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
                        const outputNames = calculation.includedBands.map(({name}) => name)
                        const eeImage = calculation.type === 'FUNCTION'
                            ? evaluateFunction(calculation, eeImageById)
                            : evaluateExpression(calculation, eeImageById)
                        eeImageById[calculation.imageId] = eeImage.rename(outputNames)
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
