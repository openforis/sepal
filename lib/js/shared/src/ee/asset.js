const ee = require('ee')
const {of} = require('rx')
const log = require('sepal/log').getLogger('ee')

// TODO: Remove _bands
const asset = ({id}, _bands, visParams) => {
    return {
        getImage$() {
            return of(ee.Image(id))
        },
        getVisParams$() {
            log.fatal({visParams})
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
