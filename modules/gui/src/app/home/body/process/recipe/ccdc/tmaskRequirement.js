import {NON_BREAKPOINT_TMASK_BANDS} from '#sepal/recipe/type/ccdc'
import {msg} from '~/translate'

import {chosenBandLabel, classificationNaming} from '../collections/selectedClassification'
import {fieldRequirement, listed} from '../requirements/fieldRequirement'

// What CCDC's TMask needs of its Sources, as its shared definition finds it (type/ccdc.js): that the bands it screens
// with are breakpoint bands. Said at the TMask bands, OPT's, naming each band that is not one as Sources name it, and the
// repairs. OPT's draft is judged against the breakpoint bands applied, and one refused cannot be applied. A Sources
// Apply removing a band it uses is not refused: OPT is marked, and what segments the image is held, until either section
// repairs it.
export const tmaskRequirement = section => fieldRequirement({
    id: `${section.id}.tmaskBands.breakpointBands`,
    section,
    code: NON_BREAKPOINT_TMASK_BANDS,
    path: ['model', 'ccdcOptions', 'tmaskBands'],
    presentation: (_diagnostic, recipe) => classificationNaming(recipe),
    message: ({missing = []} = {}, naming) => msg('process.ccdc.panel.options.form.tmaskBands.notBreakpointBands', {
        bands: listed(missing.map(band => chosenBandLabel(naming, band))),
        count: missing.length
    }),
    editor: {
        input: () => 'tmaskBands',
        candidate: (recipe, ccdcOptions) => ({...recipe, model: {...recipe.model, ccdcOptions}})
    }
})
