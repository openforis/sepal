const ee = require('sepal/ee')
const {map, of, zip} = require('rxjs')
const imageFactory = require('sepal/ee/imageFactory')
const _ = require('lodash')

const createIndex =
    ({
        model: {
            fromImage,
            toImage,
            legend: {entries},
            options: {
                minConfidence = 0
            }
        }
    },
    {selection: selectedBands} = {selection: []}
    ) => {
        const hasError = fromImage.errorBand && toImage.errorBand
        const hasChange = entries.length
        return {
            getImage$() {
                return zip(
                    // TODO: Limit to needed bands
                    imageFactory(fromImage).getImage$(),
                    imageFactory(toImage).getImage$()
                ).pipe(
                    map(([fromEEImage, toEEImage]) => {
                        const addError = image => {
                            if (hasError) {
                                const error = toEEImage.select(fromImage.errorBand)
                                    .add(fromEEImage.select(toImage.errorBand))
                                    .divide(2)
                                    .rename('error')
                                return image
                                    .addBands(error)
                            } else {
                                return image
                            }
                        }

                        const addChange = image => {
                            if (hasChange) {
                                const difference = hasError ?
                                    image.select('difference')
                                        .where(
                                            image.select('difference').abs().lt(image.select('error').multiply(minConfidence)),
                                            ee.Image(0).rename('difference')
                                        )
                                    : image.select('difference')

                                const change = ee.ImageCollection(entries.reverse().map(({value, from, to}) =>
                                    [
                                        _.isFinite(from) ? [difference.gte(from)] : [],
                                        _.isFinite(to) && from !== to ? [difference.lt(to)] : [],
                                        _.isFinite(to) && from === to ? [difference.lte(to)] : []
                                    ].flat().reduce(
                                        (acc, predicate) => acc.updateMask(predicate),
                                        ee.Image(value).rename('change').int8()
                                    )
                                )).mosaic()
                                return image.addBands(change)
                            } else {
                                return image
                            }
                        }

                        const difference = toEEImage.select(fromImage.band)
                            .subtract(fromEEImage.select(toImage.band))
                            .rename('difference')

                        const image = addChange(
                            addError(
                                difference
                            )
                        )
                        return selectedBands.length
                            ? image.select(_.uniq(selectedBands))
                            : image
                    })
                )
            },
            getBands$() {
                of([
                    ['difference'],
                    hasChange ? ['change'] : [],
                    hasError ? ['error'] : []
                ].flat())
            },
            getGeometry$() {
                return imageFactory(fromImage).getGeometry$()
            }
        }
    }

module.exports = createIndex
