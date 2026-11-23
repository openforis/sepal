import {UNSUPPORTED_COLLECTION_BANDS} from '#sepal/recipe/collectionBands'
import {msg} from '~/translate'

import {listed, sourcesFieldRequirement} from '../requirements/fieldRequirement'

// What a recipe whose Sources choose bands of the images at `field` - CCDC's breakpoint bands, Phenology's band - needs
// of the collection they configure, as its shared definition finds it (collectionBandRequirement,
// lib/js/shared/src/recipe/collectionBands.js): that it carries them, by its data sets and processing. Said at that field,
// naming each band, with the repairs; a Sources draft choosing one cannot be applied, judged against the processing
// applied. A PRC Apply leaving one uncarried is not refused: Sources are marked, and what builds from it held, until
// either section repairs it.
export const collectionBandRequirements = (sources, field) => sourcesFieldRequirement({
    id: `sources.${field}.collectionBands`,
    section: sources,
    field,
    code: UNSUPPORTED_COLLECTION_BANDS,
    message: ({unsupported = []} = {}) => msg(`process.source.collectionBands.${field}`, {
        bands: listed(unsupported, 'process.source.segments.andMore'),
        count: unsupported.length
    })
})
