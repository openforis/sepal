import {eeLimits, googleProjectId} from '#gee/config'
import {LimiterService} from '#sepal/service/limiter'

// Earth Engine's quotas are per Cloud project. The SEPAL project carries every service-account call and every
// user without a project of their own, so it is limited on its own terms.
export const eeLimiterTiers = ({limits, sepalProjectId}) => [
    {name: 'user', key: ({username}) => username, limits: () => limits.user},
    {
        name: 'project',
        key: ({projectId}) => projectId,
        limits: projectId => projectId === sepalProjectId ? limits.sepalProject : limits.project
    },
    {name: 'global', key: () => 'global', limits: () => limits.global}
]

export const {limiterService: eeLimiterService, limiter$: eeLimiter$} = LimiterService('EERestLimiter', {
    tiers: eeLimiterTiers({limits: eeLimits, sepalProjectId: googleProjectId})
})
