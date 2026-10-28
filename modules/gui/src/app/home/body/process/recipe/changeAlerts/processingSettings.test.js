import {describe, expect, it, vi} from 'vitest'

import {effectiveSettings, processingOfProducer} from '#sepal/recipe/changeAlerts/processing'

vi.mock('~/translate', () => ({msg: key => key}))

const {preserveProcessingCopies} = await import('./processingSettings')

// What applying Change Alerts' PRC saves of the processing its reference owns: the saved options as they were, whatever
// the form serialized for those settings.
describe('Change Alerts\' PRC applied', () => {
    it('keeps a reference-owned setting absent where it was saved absent, and a saved copy as saved', () => {
        const settings = effectiveSettings({options: SAVED}, processingOfProducer({sources: {dataSetType: 'RADAR'}, options: {}}))

        const applied = preserveProcessingCopies(settings)(
            {orbits: ['DESCENDING'], geometricCorrection: 'TERRAIN', spatialSpeckleFilter: 'NONE', corrections: ['SR']},
            SAVED
        )

        expect(applied).toEqual({orbits: ['DESCENDING'], spatialSpeckleFilter: 'LEE'})
    })
})

const SAVED = {orbits: ['ASCENDING'], spatialSpeckleFilter: 'LEE'}
