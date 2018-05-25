import {arrayEquals} from 'collections'
import {dataSetById, imageSourceById, isDataSetInDateRange, isSourceInDateRange, sources} from 'sources'


const updateSource = (source, dataSets, fromDate, toDate) => {
    const isSourceInRange = (sourceId) => isSourceInDateRange(sourceId, fromDate, toDate)
    const isDataSetInRange = (dataSetId) => isDataSetInDateRange(dataSetId, fromDate, toDate)

    let selectedSource = isSourceInRange(source) ? source : null
    if (!selectedSource) {
        const oneEnabledSource = sources.filter(isSourceInRange).length === 1
        selectedSource = oneEnabledSource ? sources.find(isSourceInRange) : null
    }

    let selectedDataSets = selectedSource === source
        ? (dataSets || []).filter((dataSet) => isDataSetInRange(dataSet))
        : []

    if (selectedSource && !arrayEquals(dataSets, selectedDataSets) && selectedDataSets.length === 0) {
        const dataSets = imageSourceById[selectedSource].dataSets.filter(isDataSetInRange)
        const qualities = dataSets.map((id) => dataSetById[id].quality)
        const bestQuality = Math.min(...qualities)
        selectedDataSets = dataSets.filter((id) => dataSetById[id].quality === bestQuality)
    }
    return [selectedSource, selectedDataSets]

}
export default updateSource