const {job} = require('root/jobs/job')

const worker$ = ({recipe, bands}) => {
    const ImageFactory = require('sepal/ee/imageFactory')
    const ee = require('ee')
    const {zip} = require('rx')
    const {switchMap} = require('rx/operators')

    const {getImage$, getVisParams$} = ImageFactory(recipe, bands)
    return getImage$().pipe(
        switchMap(image => getVisParams$(image).pipe(
            switchMap(visParams =>
                visParams.hsv
                    ? ee.getMap$(hsvToRgb(image, visParams))
                    : ee.getMap$(image, visParams))
            )
        )
    )
}

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

module.exports = job({
    jobName: 'Preview',
    jobPath: __filename,
    worker$
})
