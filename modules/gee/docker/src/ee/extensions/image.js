const ee = require('@google/earthengine')

// class methods

ee.Image.expr = (expression, args) =>
    ee.Image().expression(expression, {PI: Math.PI, ...args})

// instance methods

module.exports = {
    addBandsReplace(image, names) {
        return this.addBands(image, names, true)
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

    removeBands(...bands) {
        return this.select(
            this.bandNames().filter(
                ee.Filter.inList('item', bands.flat()).not()
            )
        )
    },

    selectOrDefault(bands, defaultImage) {
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

    withBand(bandName, func) {
        return func(this.select(bandName)).rename(bandName)
    }
}
