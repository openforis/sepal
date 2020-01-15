const ee = require('ee')

const filterTable = ({tableId, columnName, columnValue}) => {
    const table = ee.FeatureCollection(tableId)
    const filters = [ee.Filter.eq(columnName, columnValue)]
    if (!isNaN(columnValue))
        filters.push(ee.Filter.eq(columnName, columnValue.parseFloat()))
    return table
        .filter(ee.Filter.or(...filters))
}

module.exports = {
    filterTable
}
