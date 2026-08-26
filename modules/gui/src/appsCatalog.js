// Multiapp bundles in apps.json: a parent entry can carry an `apps[]` array
// of children. All children belong to the parent container — they inherit the
// parent's endpoint (any `endpoint` set on a child is ignored), derive their
// path from the parent, and get a `containerApp` pointer so admin UI can
// target the parent container.

const joinPath = (base, route) => {
    if (!route) return base
    const left = base.endsWith('/') ? base.slice(0, -1) : base
    const right = route.startsWith('/') ? route.slice(1) : route
    return `${left}/${right}`
}

const pick = (...values) => values.find(v => v !== undefined)

const mergeTags = (parentTags, childTags) => {
    const seen = new Set()
    const out = []
    for (const tag of [...(parentTags || []), ...(childTags || [])]) {
        if (!seen.has(tag)) {
            seen.add(tag)
            out.push(tag)
        }
    }
    return out
}

const LOCALIZED_FIELDS = ['tagline', 'description']

// `translations[lang]` overrides the English field-by-field; anything missing
// falls through to the flat English value.
const localizeApp = (app, language) => {
    const translation = app.translations?.[language]
    if (!translation) return app
    const localized = {...app}
    for (const field of LOCALIZED_FIELDS) {
        if (translation[field] !== undefined) {
            localized[field] = translation[field]
        }
    }
    return localized
}

// A child declaring either logo key owns both of them, so a parent `logo` can
// never win over a logo the child chose to express as a `logoRef`.
const logoOwner = (parent, child) =>
    child.logo !== undefined || child.logoRef !== undefined ? child : parent

const flattenChild = (parent, rawChild, language) => {
    const child = localizeApp(rawChild, language)
    const route = child.route !== undefined ? child.route : child.id
    const path = child.path || joinPath(parent.path, route)
    const logo = logoOwner(parent, child)
    // Spread the child first so any non-whitelisted fields (e.g. `single`,
    // `alt`, future additions) carry through, then override with derived and
    // inherited values.
    return {
        ...child,
        id: child.id,
        label: child.label,
        endpoint: parent.endpoint,
        path,
        containerApp: parent.id,
        tags: mergeTags(parent.tags, child.tags),
        pinned: pick(child.pinned, false),
        googleAccountRequired: pick(child.googleAccountRequired, parent.googleAccountRequired, false),
        disabled: pick(child.disabled, parent.disabled),
        logo: logo.logo,
        logoRef: pick(logo.logoRef, 'sepal.png'),
        author: pick(child.author, parent.author),
        projectLink: pick(child.projectLink, parent.projectLink),
        description: pick(child.description, ''),
        tagline: pick(child.tagline, child.label, '')
    }
}

// Tag labels are `{lang: text}` objects in the catalog; pick the language
// once here so the store holds plain strings that sort and render directly.
const localizeTag = ({label, ...tag}, language) => ({
    ...tag,
    label: typeof label === 'string'
        ? label
        : label[language] || label.en || Object.values(label)[0]
})

export const normalizeAppsCatalog = (appsSpec, language) => {
    const out = []
    for (const entry of appsSpec.apps || []) {
        if (Array.isArray(entry.apps)) {
            const {apps: children, ...parent} = entry
            // Parent stays in the list but is hidden so the grid filter
            // (`!hidden`) drops it. App-launcher reads raw apps.json and is
            // unaffected.
            out.push({...parent, hidden: true})
            for (const child of children) {
                out.push(flattenChild(parent, child, language))
            }
        } else {
            out.push(localizeApp(entry, language))
        }
    }
    return {
        ...appsSpec,
        apps: out,
        ...(appsSpec.tags ? {tags: appsSpec.tags.map(tag => localizeTag(tag, language))} : {})
    }
}

const isAbsoluteHttpsUrl = value => /^https:\/\//i.test(value)

const imageUrl = logoRef => logoRef ? `/api/apps/images/${logoRef}` : null

// `logo` points at an externally hosted image; `logoRef` names one installed on
// the SEPAL server and stays the fallback for catalogs that predate `logo`.
export const logoUrl = ({logo, logoRef} = {}) =>
    logo && isAbsoluteHttpsUrl(logo)
        ? logo
        : imageUrl(logoRef)

// Source to swap in when the browser fails to load the logoUrl choice.
export const fallbackLogoUrl = app => {
    const fallback = imageUrl(app?.logoRef)
    return logoUrl(app) === fallback ? null : fallback
}
