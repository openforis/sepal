const ee = require('ee')
const {of} = require('rx')

// TODO: Remove _bands
const asset = ({id}, _bands, visParams) => {
    return {
        getImage$() {
            return of(ee.Image(id))
        },
        getVisParams$() {
            return of(visParams || {})
        },
        getGeometry$() {
            return of(
                ee.Image(id).geometry()
            )
        }
    }
}

module.exports = asset
