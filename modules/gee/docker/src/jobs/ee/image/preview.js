const {job} = require('root/jobs/job')

const worker$ = ({recipe, bands, visParams}) => {
    const ImageFactory = require('sepal/ee/imageFactory')
    const ee = require('ee')
    const {switchMap} = require('rx/operators')
    if (visParams) {
        const {getImage$} = ImageFactory(recipe, visParams.bands)
        const getMap$ = (image, {type, bands, min, max, inverted, gamma, palette}) => {
            const range = () => ({
                min: bands.map((_, i) => inverted[i] ? max[i] : min[i]),
                max: bands.map((_, i) => inverted[i] ? min[i] : max[i]),
            })

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

            // TODO: Handle categorical images
            //   Should not support inverted
            //   Use sldStyle instead of palette
            switch (type) {
            case 'continuous':
                return ee.getMap$(image.select(bands), {bands, ...range(), gamma, palette})
            case 'rgb':
                return ee.getMap$(image.select(bands), {bands, ...range(), gamma, palette})
            case 'hsv':
                return ee.getMap$(toHsv(image.select(bands)))
            default:
                throw Error(`Unsupported type: ${type}`)
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
            return image.select(bands).hsvToRgb().float()
        }

        const {getImage$, getVisParams$} = ImageFactory(recipe, bands)
        return getImage$().pipe(
            switchMap(image => getVisParams$(image).pipe(
                switchMap(visParams =>
                    visParams.hsv
                        ? ee.getMap$(hsvToRgb(image, visParams))
                        : ee.getMap$(image, visParams))
            ))
        )
    }
}

module.exports = job({
    jobName: 'Preview',
    jobPath: __filename,
    worker$
})
