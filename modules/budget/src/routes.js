import {requireAdmin, requireAuth} from './currentUser.js'

const registerBudgetRoutes = (router, api) => router
    .get('/budget/report', requireAdmin, api.report)
    .post('/budget', requireAdmin, api.updateBudget)
    .post('/budget/requestUpdate', requireAuth, api.requestUpdate)
    .get('/budget/spending/:username', requireAdmin, api.spending)
    .get('/budget/check/:username', requireAdmin, api.check)

export {registerBudgetRoutes}
