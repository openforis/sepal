// Pure logic for matching app requirements ({minRamGiB, minCpuCount, minGpuCount} —
// named to mirror the instance-type capacity fields ramGiB/cpuCount/gpuCount) against
// instance types and running sessions, and for building the instance-picker options.
// No React, no store — unit-testable.

export const DEFAULT_REQUIREMENTS = {minRamGiB: 0, minCpuCount: 0, minGpuCount: 0}

export const appRequirements = app =>
    ({...DEFAULT_REQUIREMENTS, ...(app?.requirements || {})})

export const isSuitableInstanceType = (instanceType, requirements) =>
    instanceType.cpuCount >= requirements.minCpuCount
    && instanceType.ramGiB >= requirements.minRamGiB
    && (instanceType.gpuCount ?? 0) >= requirements.minGpuCount

// Tagged types only (untagged = legacy, not user-selectable — same filter as the
// ssh-gateway menu), cheapest first.
export const suitableInstanceTypes = (instanceTypes, requirements) =>
    (instanceTypes || [])
        .filter(({tag}) => tag)
        .filter(instanceType => isSuitableInstanceType(instanceType, requirements))
        .sort((a, b) => a.hourlyCost - b.hourlyCost)

export const cheapestSuitableInstanceType = (instanceTypes, requirements) =>
    suitableInstanceTypes(instanceTypes, requirements)[0] || null

// Is there anything the user could actually pick? (drives the picker's dead-end message)
export const hasSuitableOption = ({sessions, instanceTypes, requirements}) =>
    (sessions || []).some(session => isSuitableInstanceType(session.instanceType, requirements))
    || suitableInstanceTypes(instanceTypes, requirements).length > 0

// An option is described by two strings the picker lays out as columns: `title` — what the
// instance IS — on the left, `detail` — what it costs and provides — right-aligned, so a column of
// options can be read down the price without a separator between the two.
//
// The internal tag ("t1", "m4") identifies the type, matching the SSH menu; a legacy untagged
// type falls back to its AWS name.
const instanceTypeTitle = instanceType =>
    `${instanceType.tag ?? instanceType.name}`

const instanceTypeDetail = instanceType =>
    `${instanceType.description}, ${instanceType.hourlyCost.toFixed(2)} USD/h`

// The one-line form, for matching a typed filter against everything an option says.
const oneLine = (title, detail) =>
    `${title} — ${detail}`

// The user-facing instance number is the session's 1-based position in the report's
// session list (ordered oldest-first by the worker). Derived, not stored: numbers
// shift down when an older instance closes. Shown as a "N:" prefix in the picker and
// on app tabs, matching the ID column of the ssh-gateway terminal menu, which numbers
// the same list the same way.
export const sessionNumber = (sessions, sessionId) => {
    if (!sessions || !sessionId) {
        return null
    }
    const index = sessions.findIndex(({id}) => id === sessionId)
    return index >= 0 ? index + 1 : null
}

// A running instance is identified by the apps it hosts. The apps are kept as a
// separate field so the picker can render them on their own line; searchableText
// keeps them matchable by the combo filter.
const sessionApps = session =>
    (session.apps || []).map(({path, label}) => label || path)

// Two labelled combo sections: every running instance (unsuitable ones disabled),
// then the suitable new instance types. Option values: 'session:<id>' / 'type:<id>'.
//
// `title`/`detail` are the two columns of an option row. `label` is the closed field's one line,
// which names the instance and how many apps it hosts and leaves the specs to the list — they are
// what a choice is made on, not what a made choice needs to keep repeating. `searchableText` is
// what the typed filter matches, and it says everything.
export const buildPickerOptions = ({sessions, instanceTypes, requirements, runningLabel = 'Running instances', newLabel = 'New instance', appCountLabel = count => `${count} app${count === 1 ? '' : 's'}`}) => {
    const runningOptions = (sessions || []).map((session, index) => {
        // index + 1 IS sessionNumber(sessions, session.id) — same list, same order
        const title = `${index + 1}: ${instanceTypeTitle(session.instanceType)}`
        const detail = instanceTypeDetail(session.instanceType)
        const instanceLabel = oneLine(title, detail)
        const apps = sessionApps(session)
        return {
            value: `session:${session.id}`,
            label: apps.length ? `${title} — ${appCountLabel(apps.length)}` : title,
            title,
            detail,
            apps,
            searchableText: [instanceLabel, ...apps].join(' '),
            disabled: !isSuitableInstanceType(session.instanceType, requirements)
        }
    })
    const typeOptions = suitableInstanceTypes(instanceTypes, requirements).map(instanceType => ({
        value: `type:${instanceType.id}`,
        label: instanceTypeTitle(instanceType),
        title: instanceTypeTitle(instanceType),
        detail: instanceTypeDetail(instanceType),
        searchableText: oneLine(instanceTypeTitle(instanceType), instanceTypeDetail(instanceType))
    }))
    return [
        ...runningOptions.length ? [{label: runningLabel, options: runningOptions}] : [],
        {label: newLabel, options: typeOptions}
    ]
}

// defaultPickerValue — what the picker opens on.
//
// groupSessionIds are the instances already hosting this app or one of its group-mates (apps
// sharing an endpoint — see appOpenPlan.js). They win, because the group MUST live on one
// instance: opening Notebook while Lab runs on instance 3 and defaulting to instance 1 would make
// the obvious keystroke — accept the default — the one that pops a confirm dialog and closes Lab.
// Preselecting the group's own instance makes the default the move that costs nothing.
//
// An unsuitable group instance is skipped rather than preselected: the option is disabled in the
// list, and the user genuinely does have to move the group in that case.
export const defaultPickerValue = ({sessions, instanceTypes, requirements, groupSessionIds}) => {
    const suitable = session => isSuitableInstanceType(session.instanceType, requirements)
    const ids = new Set(groupSessionIds || [])
    const groupSession = (sessions || []).find(session => ids.has(session.id) && suitable(session))
    if (groupSession) {
        return `session:${groupSession.id}`
    }
    const suitableRunning = (sessions || []).find(suitable)
    if (suitableRunning) {
        return `session:${suitableRunning.id}`
    }
    const cheapest = cheapestSuitableInstanceType(instanceTypes, requirements)
    return cheapest ? `type:${cheapest.id}` : null
}
