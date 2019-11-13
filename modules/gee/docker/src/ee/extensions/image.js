const ee = require('@google/earthengine')

module.exports = {
    updateBands(bandNames, update) {
        return this.addBandsReplace(
            update(
                this.select(bandNames)
                    .addBands(ee.Image()) // Adds a dummy band, to prevent errors when bandNames is empty
            ).select(bandNames)
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

    removeBands(...bands) {
        return this.select(
            this.bandNames().filter(
                ee.Filter.inList('item', bands.flat()).not()
            )
        )
    },

    addBandsReplace(image, names) {
        return this.addBands(image, names, true)
    },

    unitScaleClamp(low, high) {
        return this.unitScale(low, high).clamp(0, 1)
    }
}
