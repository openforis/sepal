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

const flattenChild = (parent, child) => {
    const route = child.route !== undefined ? child.route : child.id
    const path = child.path || joinPath(parent.path, route)
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
        logoRef: pick(child.logoRef, parent.logoRef, 'sepal.png'),
        author: pick(child.author, parent.author),
        projectLink: pick(child.projectLink, parent.projectLink),
        description: pick(child.description, ''),
        tagline: pick(child.tagline, child.label, '')
    }
}

export const normalizeAppsCatalog = appsSpec => {
    const out = []
    for (const entry of appsSpec.apps || []) {
        if (Array.isArray(entry.apps)) {
            const {apps: children, ...parent} = entry
            // Parent stays in the list but is hidden so the grid filter
            // (`!hidden`) drops it. App-launcher reads raw apps.json and is
            // unaffected.
            out.push({...parent, hidden: true})
            for (const child of children) {
                out.push(flattenChild(parent, child))
            }
        } else {
            out.push(entry)
        }
    }
    return {...appsSpec, apps: out}
}
