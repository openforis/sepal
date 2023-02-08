const ee = require('#sepal/ee')

const applyPanSharpening = () =>
    image => {
        const pan = image.select('pan')
        const rgb = panSharpen(image.select(['red', 'green', 'blue']), pan)
        const nrg = panSharpen(image.select(['nir', 'red', 'green']), pan)
        return image
            .addBandsReplace(rgb)
            .addBandsReplace(nrg.select('nir'))
    }

const panSharpen = (image, pan) => {
    const hueSat = image.rgbToHsv().select(['hue', 'saturation'])
    return ee.Image.cat(hueSat, pan).hsvToRgb().rename(image.bandNames())
}

module.exports = applyPanSharpening
