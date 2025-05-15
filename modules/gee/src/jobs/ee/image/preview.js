const {job} = require('#gee/jobs/job')

const worker$ = ({
    requestArgs: {recipe, visParams, bands, ...otherArgs}
}) => {
    const ImageFactory = require('#sepal/ee/imageFactory')

    const TILE_SIZE = 256
    
    const ee = require('#sepal/ee/ee')
    const {switchMap} = require('rxjs')
    const {sequence} = require('#sepal/utils/array')
    const _ = require('lodash')

    const getRetiledMap$ = (image, retile = TILE_SIZE, visParams) =>
        ee.getMap$(retile === TILE_SIZE ? image : image.retile(retile), visParams, 'create preview map')

    if (visParams) {
        const {getImage$} = ImageFactory(recipe, {selection: distinct(visParams.bands), baseBands: distinct(visParams.baseBands), ...otherArgs})
        const getMap$ = (image, visualization) => {
            const {type, bands, min, max, inverted, gamma, palette} = visualization
            const range = () => ({
                min: bands.map((_, i) => inverted && inverted[i] ? max[i] : min[i]),
                max: bands.map((_, i) => inverted && inverted[i] ? min[i] : max[i]),
            })

            const toInt = value => typeof value === 'string' ? parseInt(value) : value

            const toCategoricalVisParams = () => {
                const values = visualization.values
                    ? visualization.values.map(toInt)
                    : min && max && sequence(min[0], max[0])
                if (!values) {
                    throw Error('A categorical visualization must contain either values or min and max')
                }
                if (!palette || palette.length !== values.length) {
                    throw Error(`Visualization must contain a palette with the same number of colors as categorical values: ${JSON.stringify({palette, values})}`)
                }

                const minValue = values[0]
                const maxValue = values[values.length - 1]
                const paddedPalette = sequence(minValue, maxValue).map(() => '#000000')
                values.forEach((value, i) => {
                    paddedPalette[value - minValue] = palette[i]
                })
                return {
                    min: minValue,
                    max: maxValue,
                    palette: paddedPalette
                }
            }

            const toHsv = image => {
                const stretchImage = (image, min, max) => {
                    return image.expression('toMin + (i - fromMin) * (toMax - toMin) / (fromMax - fromMin)', {
                        'fromMin': min,
                        'fromMax': max,
                        'toMin': 0,
                        'toMax': 1,
                        'i': image
                    })
                }
                return ee.Image(
                    bands.map((band, i) => {
                        const {min, max} = range()
                        return stretchImage(image.select(band), min[i], max[i])
                            .rename(band)
                    })
                ).hsvToRgb().float()
            }

            switch (type) {
            case 'categorical':
                return getRetiledMap$(image.select(_.uniq(bands)), recipe.retile, toCategoricalVisParams())
            case 'hsv':
                return getRetiledMap$(toHsv(image.select(_.uniq(bands))), recipe.retile)
            default:
                return getRetiledMap$(image.select(_.uniq(bands)), recipe.retile, {bands, ...range(), gamma, palette})
            }
        }

        return getImage$().pipe(
            switchMap(image =>
                getMap$(image, visParams)
            )
        )
    } else {
        // For backwards compatibility
        const hsvToRgb = (image, visParams) => {
            const stretchImage = (image, fromRange, toRange) => {
                return image.expression('toMin + (i - fromMin) * (toMax - toMin) / (fromMax - fromMin)', {
                    'fromMin': fromRange[0],
                    'fromMax': fromRange[1],
                    'toMin': toRange[0],
                    'toMax': toRange[1],
                    'i': image
                })
            }
            const stretch = visParams.stretch || []
            const bands = visParams.bands
            stretch.forEach((toRange, i) => {
                const fromRange = [visParams['min'][i], visParams['max'][i]]
                if (!toRange)
                    toRange = [0, 1]
                const band = bands[i]
                const stretched = stretchImage(image.select(band), fromRange, toRange)
                    .rename(band)
                image = image.addBands(stretched, null, true)
            })
            return image.select(_.uniq(bands)).hsvToRgb().float()
        }

        const {getImage$, getVisParams$} = ImageFactory(recipe, bands)
        return getImage$().pipe(
            switchMap(image => getVisParams$(image).pipe(
                switchMap(visParams =>
                    visParams.hsv
                        ? ee.getMap$(hsvToRgb(image, visParams), null, 'create preview map')
                        : ee.getMap$(image, visParams), null, 'create preview map')
            ))
        )
    }
}

const distinct = array => [...new Set(array)]

module.exports = job({
    jobName: 'Preview',
    jobPath: __filename,
    worker$
})
