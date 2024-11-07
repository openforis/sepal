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
                const selection = image.includedBands.map(({name}) => name)
                const eeImage$ = imageFactory(image, {selection}).getImage$().pipe(
                    map(image => image.select(selection))
                )
                eeImage$ById[image.imageId] = eeImage$
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
                        const eeImageRenamed = eeImage.rename(outputNames)
                        const eeImageCasted = calculation.dataType === 'auto'
                            ? eeImageRenamed
                            : eeImageRenamed.cast(ee.Dictionary.fromLists(
                                outputNames,
                                Array(outputNames.length).fill(calculation.dataType)
                            ))
                        
                        eeImageById[calculation.imageId] = eeImageCasted.rename(outputNames)
                        return eeImageById
                    },
                    eeImageById
                )
            ),
            map(eeImageById => {
                const images = outputImages.map(({imageId, outputBands}) =>
                    eeImageById[imageId].select(
                        outputBands.map(({name}) => name),
                        outputBands.map(({defaultOutputName, outputName}) => outputName || defaultOutputName)
                    )
                )
                const image = ee.Image(images)
                    .select(selectedBands?.length ? selectedBands : '.*')
                return images.length
                    ? image.clip(images
                        .slice(1)
                        .reduce(
                            (acc, geometry) => acc.union(geometry),
                            images[0].geometry()
                        ))
                    : image
            })
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
