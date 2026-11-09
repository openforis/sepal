import {UNSUPPORTED_COLLECTION_BANDS} from '#sepal/recipe/collectionBands'
import {MISSING_DATA_SETS, MISSING_INDEX} from '#sepal/recipe/type/landTrendr'
import {msg} from '~/translate'

import {dataSetPeriodRequirement} from '../collections/dataSetPeriodRequirement'
import {listed, sourcesFieldRequirement} from '../requirements/fieldRequirement'

// What LandTrendr's change map needs of its Sources, as its shared definition finds it (type/landTrendr.js): data sets,
// one of which may hold imagery in its years, and an index the collection they configure can carry. Its output read
// judges that, so the Sources button and the operations over the image say it, and so does the Sources editor beside the
// field each concerns, its draft judged against the dates and processing applied. What is missing is said in the words of
// the form's own required rules, once (inputFeedback.js), and what was saved missing is said at once. A Dates or PRC
// Apply leaving the Sources unsound is not refused: Sources are marked until they are repaired.
export const sourcesRequirements = sources => [
    sourcesField(sources, 'dataSets', MISSING_DATA_SETS, required('dataSets')),
    dataSetPeriodRequirement(sources),
    sourcesField(sources, 'index', MISSING_INDEX, required('index')),
    sourcesField(sources, 'index', UNSUPPORTED_COLLECTION_BANDS, uncarriedIndex)
]

// An index is named in capitals, as Sources offer it.
export const indexLabel = index => index.toUpperCase()

// Why the data sets cannot compute the index, where the index table says: the input bands some lack, and those data
// sets. Removing them is suggested only where the finding says that leaves Sources the change map can use. Anything
// else they cannot provide, such as a native band, is said without a cause: processing might repair one and data sets
// another, so only another index, which the panel offers only where it can be computed, is suggested.
const uncarriedIndex = ({unsupported = [], missingInputs: [missing] = [], removable} = {}) => {
    if (!missing) {
        return msg('process.landTrendr.panel.sources.form.index.unsupported', {index: listed(unsupported.map(indexLabel), AND_MORE)})
    }
    const facts = {
        index: indexLabel(missing.index),
        bands: listed(missing.bands.map(band => msg(['bands', band])), AND_MORE),
        count: missing.bands.length,
        dataSets: listed(missing.dataSets.map(dataSetName), AND_MORE),
        dataSetCount: missing.dataSets.length
    }
    return removable
        ? msg('process.landTrendr.panel.sources.form.index.removeDataSets', {...facts, removable: listed(removable.map(dataSetName), AND_MORE)})
        : msg('process.landTrendr.panel.sources.form.index.missingInputs', facts)
}

const dataSetName = dataSet => msg(['sources.dataSets', dataSet, 'name'])

const AND_MORE = 'process.source.segments.andMore'

const required = field => () => msg(`process.landTrendr.panel.sources.form.${field}.required`)

const sourcesField = (section, field, code, message) =>
    sourcesFieldRequirement({id: `sources.${field}.${code}`, section, field, code, message})
