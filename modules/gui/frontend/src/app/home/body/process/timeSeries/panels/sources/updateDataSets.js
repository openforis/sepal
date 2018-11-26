import {isDataSetInDateRange} from 'sources'

const updateDataSets = (dataSets, fromDate, toDate) => {
    const isDataSetInRange = dataSetId => isDataSetInDateRange(dataSetId, fromDate, toDate)
    return (dataSets || []).filter(dataSet => isDataSetInRange(dataSet))
}
export default updateDataSets
