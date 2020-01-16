const {interval} = require('rxjs')
const {map, switchMap, take, tap} = require('rxjs/operators')
const ImageFactory = require('sepal/ee/imageFactory')
const ee = require('ee')

module.exports = {
    submit$: (id, {image: {recipe, bands, scale}}) => {
        const {getImage$} = ImageFactory(recipe, bands)
        return getImage$().pipe(
            switchMap(image => {
                console.log('GOT IMAGE')
                return ee.getInfo$(image.bandNames()).pipe()
            }),
            tap(bandNames => console.log('****** BAND NAMES', bandNames)),
            switchMap(() => interval(100)),
            map(i => ({
                message: 'SOME MESSAGE ' + i
            })),
            tap(m => console.log('Working: ', m)),
            take(100)
        )
    }
}
