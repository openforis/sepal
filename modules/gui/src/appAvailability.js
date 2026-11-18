// Whether a catalog app can be started, and whether it is still listed. A retired app stops
// launching the moment the catalog sets `retiredOn`; the date only starts the countdown to its
// removal from the list.

const RETIRED_LISTING_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000
const CATALOG_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export const unavailableReason = (app, {serviceAccount}) => {
    if (retirementTime(app) !== null) return 'retired'
    if (app.disabled) return 'disabled'
    if (app.googleAccountRequired && serviceAccount) return 'googleAccountRequired'
    return null
}

export const isAppListed = (app, now) => {
    const removal = removalTime(app)
    return !app.hidden && (removal === null || now.getTime() < removal)
}

export const removalDate = app => {
    const removal = removalTime(app)
    return removal === null ? null : new Date(removal).toISOString().slice(0, 10)
}

// Catalog dates name a calendar day, so they are shown in UTC to keep the same day everywhere.
export const formatCatalogDate = (value, language) => {
    const time = catalogTime(value)
    return time === null
        ? null
        : new Date(time).toLocaleDateString(language, {timeZone: 'UTC', dateStyle: 'medium'})
}

const removalTime = app => {
    const retirement = retirementTime(app)
    return retirement === null ? null : retirement + RETIRED_LISTING_DAYS * DAY_MS
}

const retirementTime = app => catalogTime(app.retiredOn)

const catalogTime = value => {
    const match = typeof value === 'string' && CATALOG_DATE.exec(value)
    if (!match) return null
    const [year, month, day] = match.slice(1).map(Number)
    const time = Date.UTC(year, month - 1, day)
    return new Date(time).getUTCDate() === day ? time : null
}
