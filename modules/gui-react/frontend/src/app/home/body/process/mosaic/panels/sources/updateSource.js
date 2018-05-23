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


    const arrayEquals = (a1, a2) => {
        if (a1 === a2) return true
        if ((a1 && a1.length || 0) != (a2 && a2.length) || 0) return false
        if (a1 && !a2 || a2 && !a1) return false
        if (a1.find((e, i) => e !== a2[i])) return false
        return true
    }
    console.log('equals', dataSets, selectedDataSets, arrayEquals(dataSets, selectedDataSets))
    if (selectedSource && !arrayEquals(dataSets, selectedDataSets) && selectedDataSets.length === 0) {
        const dataSets = imageSourceById[selectedSource].dataSets.filter(isDataSetInRange)
        const qualities = dataSets.map((id) => dataSetById[id].quality)
        const bestQuality = Math.min(...qualities)
        selectedDataSets = dataSets.filter((id) => dataSetById[id].quality === bestQuality)
    }
    return [selectedSource, selectedDataSets]

}
export default updateSource