const ee = require('@google/earthengine')

module.exports = {
    updateBands(bandNames, update) {
        return this.addBands(
            update(
                this.select(bandNames)
                    .addBands(ee.Image()) // Adds a dummy band, to prevent errors when bandNames is empty
            ).select(bandNames), null, true
        )
    }
}
