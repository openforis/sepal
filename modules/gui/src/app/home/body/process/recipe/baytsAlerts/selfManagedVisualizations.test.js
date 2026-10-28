import {expect, it} from 'vitest'

import {SELF_MANAGED_VISUALIZATIONS} from '~/app/home/body/process/recipe/recipeImageLayer'

// TEMPORARY MIGRATION GUARD. This list disappears once a generic preview-binding controller owns parameterized
// product selection and reconciliation; until then, membership is the only thing keeping two writers apart.
//
// baytsAlertsImageLayer reconciles visParams itself, because the available bands differ between the alerts view
// and the radar first/last views. The alert output carries no radar band at all, so a generic reconciliation that
// ran beside it would overwrite a radar preset with an alert one as soon as it was selected.
it('leaves visParams reconciliation to the BAYTS Alerts layer form', () => {
    expect(SELF_MANAGED_VISUALIZATIONS).toContain('BAYTS_ALERTS')
})
