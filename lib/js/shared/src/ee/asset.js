const ee = require('sepal/ee')
const {of} = require('rxjs')

const asset = ({id}, _bands) => {
    return {
        getImage$() {
            return of(ee.Image(id))
        },
        getBands$() {
            return ee.getInfo$(ee.Image(id).bandNames(), 'asset band names')
        },
        getVisParams$() {
            return of({})
        },
        getGeometry$() {
            return of(
                ee.Image(id).geometry()
            )
        }
    }
}

module.exports = asset
