const job = require('root/worker/job')

const worker$ = ({recipe, bands}) => {
    const ImageFactory = require('root/ee/imageFactory')
    const {getMap$} = require('root/ee/utils')
    const {zip} = require('rxjs')
    const {switchMap} = require('rxjs/operators')
    
    const {getImage$, getVisParams$} = ImageFactory(recipe, bands)
    return zip(getImage$(), getVisParams$()).pipe(
        switchMap(([image, visParams]) => visParams.hsv
            ? getMap$(hsvToRgb(image, visParams))
            : getMap$(image, visParams))
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
    jobName: 'EE Image preview',
    jobPath: __filename,
    before: [require('root/ee/initialize')],
    args: ctx => [ctx.request.body],
    worker$
})
