const ee = require('@google/earthengine')
const {of} = require('rxjs')

const asset = ({id}) => {
    return {
        getImage$() {
            return of(ee.Image(id))
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
