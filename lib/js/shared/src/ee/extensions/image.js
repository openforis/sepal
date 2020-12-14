const _ = require('lodash')

module.exports = ee => {
// class methods

    ee.Image.expr = (expression, args) =>
        ee.Image().expression(expression, {PI: Math.PI, ...args})

    // instance methods

    return {
        addBandsReplace(image, names) {
            return this.addBands(image, names, true)
        },

        combinePairwise(algorithm, suffix = '') {
            const callback = _.isString(algorithm)
                ? (img1, img2) => ee.Image.expr(algorithm, {b1: img1, b2: img2})
                : algorithm
            const image = this
            return ee.Image(
                image.bandNames().iterate(
                    (b1, accImage) => {
                        b1 = ee.String(b1)
                        accImage = ee.Image(accImage)
                        const img1 = image.select(b1).rename('img1')
                        const i1 = image.bandNames().indexOf(b1)
                        const combinations = ee.Image(image.bandNames().slice(i1.add(1)).iterate(
                            (b2, accImage) => {
                                b2 = ee.String(b2)
                                accImage = ee.Image(accImage)
                                const img2 = image.select(b2).rename('img2')
                                return accImage.addBands(
                                    callback(img1, img2)
                                        .rename(b1.cat('_').cat(b2).cat(suffix || ''))
                                )
                            },
                            ee.Image([]))
                        )
                        return accImage.addBands(combinations)
                    },
                    ee.Image([])
                )
            )
        },

        compose(...operations) {
            return operations
                .reduce(
                    (image, operation) => typeof operation === 'function'
                        ? image.addBandsReplace(operation(image))
                        : image,
                    this
                )
        },

        bandCount() {
            return this.bandNames().size()
        },

        excludeBands(...regExpressions) {
            const bandNames = this.bandNames()
                .map(name => {
                    const excluded = ee.Number(ee.List(
                        regExpressions.map(regex => ee.String(name).match(regex).size())
                    ).reduce(ee.Reducer.min())).not()
                    return ee.List([name]).slice(excluded.subtract(1).max(0), excluded)
                }).flatten()
            return this.select(bandNames)
        },

        removeBands(...bands) {
            return this.select(
                this.bandNames().filter(
                    ee.Filter.inList('item', bands.flat()).not()
                )
            )
        },

        selectOrDefault(bands, defaultImage = ee.Image()) {
            const defaults = ee.Image(
                ee.List(bands).iterate(
                    (bandName, acc) => ee.Image(acc).addBands(
                        defaultImage.rename(ee.String(bandName))
                    ),
                    ee.Image([])
                )
            )
            return this.addBands(defaults).select(bands)
        },

        selectExisting(bands) {
            return this.select(
                this.bandNames().filter(ee.Filter(
                    ee.Filter.inList('item', bands)
                ))
            )
        },

        selfExpression(expression, additionalImages) {
            return this.expression(expression, {i: this, ...additionalImages})
        },

        toDegrees() {
            return this.multiply(180).divide(Math.PI)
        },

        toRadians() {
            return this.multiply(Math.PI).divide(180)
        },

        unitScaleClamp(low, high) {
            return this
                .subtract(low)
                .divide(high - low)
                .clamp(0, 1)
        },

        updateBands(bandNames, update) {
            return this.addBandsReplace(
                update(
                    this.select(bandNames)
                        .addBands(ee.Image()) // Adds a dummy band, to prevent errors when bandNames is empty
                ).select(bandNames)
            )
        },

        when(condition, value) {
            const trueList = ee.List.sequence(
                0,
                condition.not().not().subtract(1)  // -1 if false, 0 if true
            )
            return ee.Image([]).addBands(
                ee.Image(
                    trueList.iterate(
                        (_ignore1, _ignore2) => value,
                        ee.Image([])
                    )
                )
            )
        },

        withBand(bandName, func) {
            return func(this.select(bandName)).rename(bandName)
        }
    }
}
