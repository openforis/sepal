const ee = require('ee')
const _ = require('lodash')

const filterTable = ({tableId, columnName, columnValue}) => {
    const table = ee.FeatureCollection(tableId)
    const filters = [ee.Filter.eq(columnName, columnValue)]
    if (_.isFinite(columnValue))
        filters.push(ee.Filter.eq(columnName, _.toNumber(columnValue)))
    return table
        .filter(ee.Filter.or(...filters))
}

module.exports = {
    filterTable
}
