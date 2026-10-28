// Pure logic for matching app requirements ({minRamGiB, minCpuCount, minGpuCount} —
// named to mirror the instance-type capacity fields ramGiB/cpuCount/gpuCount) against
// instance types and running sessions, and for building the instance-picker options.
// No React, no store — unit-testable.

import {instanceSpecs} from '../../instanceSpecs'
import {instanceLabel} from '../../user/userSessionSummary'

export const DEFAULT_REQUIREMENTS = {minRamGiB: 0, minCpuCount: 0, minGpuCount: 0}

export const appRequirements = app =>
    ({...DEFAULT_REQUIREMENTS, ...(app?.requirements || {})})

// The floors in the order and form of the specs pill ("4 CPU · 16 GB"), leaving out unset ones.
export const requirementSpecs = ({minRamGiB, minCpuCount, minGpuCount}) =>
    [
        minCpuCount ? `${minCpuCount} CPU` : null,
        minGpuCount ? `${minGpuCount} GPU` : null,
        minRamGiB ? `${minRamGiB} GB` : null
    ].filter(Boolean).join(' · ')

export const isSuitableInstanceType = (instanceType, requirements) =>
    instanceType.cpuCount >= requirements.minCpuCount
    && instanceType.ramGiB >= requirements.minRamGiB
    && (instanceType.gpuCount ?? 0) >= requirements.minGpuCount

// Tagged types only (untagged = legacy, not user-selectable), in catalog order — the same filter
// and order as the ssh-gateway menu.
export const suitableInstanceTypes = (instanceTypes, requirements) =>
    selectableInstanceTypes(instanceTypes)
        .filter(instanceType => isSuitableInstanceType(instanceType, requirements))

const selectableInstanceTypes = instanceTypes =>
    (instanceTypes || []).filter(({tag}) => tag)

export const cheapestSuitableInstanceType = (instanceTypes, requirements) =>
    suitableInstanceTypes(instanceTypes, requirements)
        .reduce((cheapest, instanceType) => !cheapest || instanceType.hourlyCost < cheapest.hourlyCost ? instanceType : cheapest, null)

// An option row is `title` — what the instance IS — on the left and its `instanceType` — what it
// costs and provides, in the same specs pill the session list shows — right-aligned, so a column
// of options can be read down the price without a separator between the two.
//
// The internal tag ("t1", "m4") identifies the type, matching the SSH menu; a legacy untagged
// type falls back to its AWS name.
const instanceTypeTitle = instanceType =>
    `${instanceType.tag ?? instanceType.name}`

// The one-line form, for matching a typed filter against everything an option says.
const oneLine = (title, instanceType) =>
    `${title} — ${instanceSpecs(instanceType)}`

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

// Labelled combo sections: the running instances, then the new instance types, the ones below the
// requirements dimmed. Option values: 'session:<id>' / 'type:<id>'.
//
// `title`/`instanceType` are the two columns of a new instance type's row; a running instance's row
// has only its title, since its specs are what the session list shows. `label` is the closed field's one
// line, which names the instance and how many apps it hosts and leaves the specs to the list — they
// are what a choice is made on, not what a made choice needs to keep repeating. `searchableText`
// is what the typed filter matches, and it says everything.
export const buildPickerOptions = ({sessions, instanceTypes, requirements, runningLabel = 'Running instances', newLabel = 'New instance without SSD', newSsdLabel = 'New instance with SSD', appCountLabel = count => `${count} app${count === 1 ? '' : 's'}`}) => {
    const runningOptions = (sessions || []).map((session, index) => {
        // index + 1 IS sessionNumber(sessions, session.id) — same list, same order.
        const title = instanceLabel(session, index)
        const apps = sessionApps(session)
        return {
            value: `session:${session.id}`,
            label: apps.length ? `${title} — ${appCountLabel(apps.length)}` : title,
            title,
            apps,
            searchableText: [title, ...apps].join(' '),
            dimmed: !isSuitableInstanceType(session.instanceType, requirements)
        }
    })
    const typeOptions = selectableInstanceTypes(instanceTypes).map(instanceType => ({
        value: `type:${instanceType.id}`,
        label: instanceTypeTitle(instanceType),
        title: instanceTypeTitle(instanceType),
        instanceType,
        searchableText: oneLine(instanceTypeTitle(instanceType), instanceType),
        dimmed: !isSuitableInstanceType(instanceType, requirements)
    }))
    const section = (label, options) => options.length ? [{label, options}] : []
    return [
        ...section(runningLabel, runningOptions),
        ...section(newLabel, typeOptions.filter(({instanceType}) => !instanceType.ssdGB)),
        ...section(newSsdLabel, typeOptions.filter(({instanceType}) => instanceType.ssdGB))
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
// An unsuitable group instance is skipped rather than preselected, so the default meets the app's
// requirements whenever any instance does. When none does, the default is the one the app would get
// without requirements.
export const defaultPickerValue = inputs =>
    defaultWithin(inputs, inputs.requirements) ?? defaultWithin(inputs, DEFAULT_REQUIREMENTS)

const defaultWithin = ({sessions, instanceTypes, groupSessionIds}, requirements) => {
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
