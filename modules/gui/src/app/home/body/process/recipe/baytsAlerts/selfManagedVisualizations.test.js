import {expect, it} from 'vitest'

import {SELF_MANAGED_VISUALIZATIONS} from '~/app/home/body/process/recipe/recipeImageLayer'

import {alertsBands} from './bands'

// TEMPORARY MIGRATION GUARD. This list disappears once a generic preview-binding controller owns parameterized
// product selection and reconciliation; until then, membership is the only thing keeping two writers apart.
//
// baytsAlertsImageLayer reconciles visParams itself, because the available bands differ between the alerts view
// and the radar first/last views. While the generic reconciliation in recipeImageLayer also runs, the two
// disagree: the generic one validates against `alertsBands()` because it calls getAvailableBands without a
// visualization type, and that set contains only VV, VH and ratio_VV_VH from the radar vocabulary. Every other
// radar preset is therefore overwritten as soon as it is selected.
it('leaves visParams reconciliation to the BAYTS Alerts layer form', () => {
    expect(SELF_MANAGED_VISUALIZATIONS).toContain('BAYTS_ALERTS')
})

it('cannot validate radar visualizations, which is why generic reconciliation must stand down', () => {
    const bands = Object.keys(alertsBands())
    expect(bands).toContain('VV')
    expect(bands).not.toContain('VV_med')
    expect(bands).not.toContain('VV_std')
    expect(bands).not.toContain('dayOfYear')
})
