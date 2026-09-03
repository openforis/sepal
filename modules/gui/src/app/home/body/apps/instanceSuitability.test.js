import {describe, expect, it} from 'vitest'

import {
    appRequirements, buildPickerOptions, cheapestSuitableInstanceType,
    defaultPickerValue, hasSuitableOption, isSuitableInstanceType, sessionNumber, suitableInstanceTypes
} from './instanceSuitability'

const T3 = {id: 'T3aSmall', name: 't3a.small', tag: 't1', cpuCount: 1, ramGiB: 2, hourlyCost: 0.0204, gpuCount: 0, description: '1 CPU, 2 GiB'}
const M6 = {id: 'M6aXlarge', name: 'm6a.xlarge', tag: 'm4', cpuCount: 4, ramGiB: 16, hourlyCost: 0.1926, gpuCount: 0, description: '4 CPU, 16 GiB'}
const G5 = {id: 'G5Xlarge', name: 'g5.xlarge', tag: 'g4', cpuCount: 4, ramGiB: 16, hourlyCost: 1.123, gpuCount: 1, description: '4 CPU, 1 GPU, 16 GiB'}
const G548 = {id: 'G548xlarge', name: 'g5.48xlarge', tag: 'g192', cpuCount: 192, ramGiB: 768, hourlyCost: 16.288, gpuCount: 8, description: '192 CPU, 8 GPU, 768 GiB'}
const LEGACY = {id: 'T2Small', name: 't2.small', cpuCount: 1, ramGiB: 2, hourlyCost: 0.025, gpuCount: 0, description: '1 CPU, 2 GiB'} // no tag
const TYPES = [M6, T3, G5, LEGACY]

const session = (id, instanceType) => ({id, instanceType, apps: []})

describe('appRequirements', () => {
    it('defaults missing requirements to zero', () => {
        expect(appRequirements({})).toEqual({minRamGiB: 0, minCpuCount: 0, minGpuCount: 0})
        expect(appRequirements({requirements: {minRamGiB: 8}})).toEqual({minRamGiB: 8, minCpuCount: 0, minGpuCount: 0})
    })
})

describe('isSuitableInstanceType', () => {
    it('checks cpu, ram and gpuCount floors', () => {
        expect(isSuitableInstanceType(T3, {minRamGiB: 2, minCpuCount: 1, minGpuCount: 0})).toBe(true)
        expect(isSuitableInstanceType(T3, {minRamGiB: 4, minCpuCount: 1, minGpuCount: 0})).toBe(false)
        expect(isSuitableInstanceType(M6, {minRamGiB: 8, minCpuCount: 4, minGpuCount: 0})).toBe(true)
        expect(isSuitableInstanceType(M6, {minRamGiB: 8, minCpuCount: 4, minGpuCount: 1})).toBe(false)
        expect(isSuitableInstanceType(G5, {minRamGiB: 8, minCpuCount: 4, minGpuCount: 1})).toBe(true)
    })

    it('gpuCount is a count, not a flag', () => {
        expect(isSuitableInstanceType(G5, {minRamGiB: 0, minCpuCount: 0, minGpuCount: 2})).toBe(false)   // 1 GPU < 2 required
        expect(isSuitableInstanceType(G548, {minRamGiB: 0, minCpuCount: 0, minGpuCount: 2})).toBe(true)  // 8 GPUs >= 2
        expect(isSuitableInstanceType(G548, {minRamGiB: 0, minCpuCount: 0, minGpuCount: 8})).toBe(true)
    })
})

describe('suitableInstanceTypes', () => {
    it('keeps only tagged suitable types, cheapest first', () => {
        expect(suitableInstanceTypes(TYPES, {minRamGiB: 0, minCpuCount: 0, minGpuCount: 0}).map(({id}) => id))
            .toEqual(['T3aSmall', 'M6aXlarge', 'G5Xlarge'])
        expect(cheapestSuitableInstanceType(TYPES, {minRamGiB: 8, minCpuCount: 2, minGpuCount: 0}).id).toBe('M6aXlarge')
        expect(cheapestSuitableInstanceType(TYPES, {minRamGiB: 1024, minCpuCount: 0, minGpuCount: 0})).toBe(null)
    })
})

describe('sessionNumber', () => {
    it('numbers sessions by their position in the report list, oldest first', () => {
        const sessions = [session('s-1', T3), session('s-2', M6)]
        expect(sessionNumber(sessions, 's-1')).toBe(1)
        expect(sessionNumber(sessions, 's-2')).toBe(2)
    })

    it('returns null when the session is absent or inputs are missing', () => {
        const sessions = [session('s-1', T3)]
        expect(sessionNumber(sessions, 's-9')).toBe(null)
        expect(sessionNumber(sessions, undefined)).toBe(null)
        expect(sessionNumber(undefined, 's-1')).toBe(null)
        expect(sessionNumber([], 's-1')).toBe(null)
    })
})

describe('buildPickerOptions', () => {
    it('builds two sections: running instances (unsuitable disabled) and suitable types', () => {
        const sessions = [session('s-1', T3), session('s-2', M6)]
        const options = buildPickerOptions({sessions, instanceTypes: TYPES, requirements: {minRamGiB: 8, minCpuCount: 2, minGpuCount: 0}})
        expect(options).toHaveLength(2)
        const [running, fresh] = options
        expect(running.options.map(({value, disabled}) => ({value, disabled: !!disabled})))
            .toEqual([{value: 'session:s-1', disabled: true}, {value: 'session:s-2', disabled: false}])
        expect(fresh.options.map(({value}) => value)).toEqual(['type:M6aXlarge', 'type:G5Xlarge'])
    })

    it('lists the hosted apps separately from the label, but keeps them searchable', () => {
        const sessions = [{id: 's-1', instanceType: T3, apps: [
            {path: '/sandbox/shiny/foo', label: 'Foo'},
            {path: '/sandbox/jupyter/bar.ipynb'}
        ]}]
        const options = buildPickerOptions({sessions, instanceTypes: TYPES, requirements: {minRamGiB: 0, minCpuCount: 0, minGpuCount: 0}})
        const [option] = options[0].options
        expect(option.label).toBe('1: t3a.small — 1 CPU, 2 GiB, 0.02 USD/h — 2 apps')
        expect(option.instanceLabel).toBe('1: t3a.small — 1 CPU, 2 GiB, 0.02 USD/h')
        expect(option.apps).toEqual(['Foo', '/sandbox/jupyter/bar.ipynb'])
        expect(option.searchableText).toBe('1: t3a.small — 1 CPU, 2 GiB, 0.02 USD/h Foo /sandbox/jupyter/bar.ipynb')
    })

    it('prefixes running instances with their 1-based report position, disabled ones included', () => {
        const sessions = [session('s-1', T3), session('s-2', M6)]
        const options = buildPickerOptions({sessions, instanceTypes: TYPES, requirements: {minRamGiB: 8, minCpuCount: 2, minGpuCount: 0}})
        expect(options[0].options.map(({label}) => label)).toEqual([
            '1: t3a.small — 1 CPU, 2 GiB, 0.02 USD/h',
            '2: m6a.xlarge — 4 CPU, 16 GiB, 0.19 USD/h'
        ])
        // new-instance types are not numbered
        expect(options[1].options.map(({label}) => label)).toEqual([
            'm6a.xlarge — 4 CPU, 16 GiB, 0.19 USD/h',
            'g5.xlarge — 4 CPU, 1 GPU, 16 GiB, 1.12 USD/h'
        ])
    })

    it('pluralizes the app count and omits it when the instance hosts no apps', () => {
        const sessions = [
            {id: 's-1', instanceType: T3, apps: [{path: '/sandbox/shiny/foo', label: 'Foo'}]},
            session('s-2', M6)
        ]
        const options = buildPickerOptions({sessions, instanceTypes: TYPES, requirements: {minRamGiB: 0, minCpuCount: 0, minGpuCount: 0}})
        const [withApp, withoutApps] = options[0].options
        expect(withApp.label).toBe('1: t3a.small — 1 CPU, 2 GiB, 0.02 USD/h — 1 app')
        expect(withoutApps.label).toBe('2: m6a.xlarge — 4 CPU, 16 GiB, 0.19 USD/h')
    })

    it('omits the running section when no instance is running', () => {
        const options = buildPickerOptions({sessions: [], instanceTypes: TYPES, requirements: {minRamGiB: 0, minCpuCount: 0, minGpuCount: 0}})
        expect(options).toHaveLength(1)
        expect(options[0].options.map(({value}) => value)).toEqual(['type:T3aSmall', 'type:M6aXlarge', 'type:G5Xlarge'])
    })
})

describe('hasSuitableOption', () => {
    it('is false when neither running sessions nor types satisfy the requirements', () => {
        expect(hasSuitableOption({sessions: [session('s-1', T3)], instanceTypes: TYPES, requirements: {minRamGiB: 4096, minCpuCount: 0, minGpuCount: 0}}))
            .toBe(false)
        expect(hasSuitableOption({sessions: [], instanceTypes: TYPES, requirements: {minRamGiB: 8, minCpuCount: 2, minGpuCount: 0}}))
            .toBe(true)
    })
})

describe('defaultPickerValue', () => {
    it('prefers the first suitable running instance', () => {
        const sessions = [session('s-1', T3), session('s-2', M6)]
        expect(defaultPickerValue({sessions, instanceTypes: TYPES, requirements: {minRamGiB: 8, minCpuCount: 2, minGpuCount: 0}}))
            .toBe('session:s-2')
    })

    it('falls back to the cheapest suitable type', () => {
        expect(defaultPickerValue({sessions: [session('s-1', T3)], instanceTypes: TYPES, requirements: {minRamGiB: 8, minCpuCount: 2, minGpuCount: 0}}))
            .toBe('type:M6aXlarge')
        expect(defaultPickerValue({sessions: [], instanceTypes: TYPES, requirements: {minRamGiB: 0, minCpuCount: 0, minGpuCount: 0}}))
            .toBe('type:T3aSmall')
    })

    it('returns null when nothing is suitable', () => {
        expect(defaultPickerValue({sessions: [], instanceTypes: TYPES, requirements: {minRamGiB: 4096, minCpuCount: 0, minGpuCount: 0}}))
            .toBeNull()
    })

    // The app's ENDPOINT is its group, and a group MUST live on one instance (appOpenPlan.js).
    // Defaulting anywhere else would make "accept the default" the keystroke that pops a confirm
    // dialog and closes the group-mates.
    it('preselects the instance already hosting a group-mate', () => {
        const sessions = [session('s-1', T3), session('s-2', M6), session('s-3', M6)]
        expect(defaultPickerValue({
            sessions, instanceTypes: TYPES,
            requirements: {minRamGiB: 8, minCpuCount: 2, minGpuCount: 0},
            groupSessionIds: ['s-3']
        })).toBe('session:s-3')
    })

    it('falls back to the first suitable instance when the group is elsewhere', () => {
        const sessions = [session('s-1', M6), session('s-2', M6)]
        expect(defaultPickerValue({
            sessions, instanceTypes: TYPES,
            requirements: {minRamGiB: 8, minCpuCount: 2, minGpuCount: 0},
            groupSessionIds: ['s-missing']
        })).toBe('session:s-1')
    })

    // The option would be disabled in the list, and moving the group is genuinely required.
    it('skips a group instance that cannot host this app', () => {
        const sessions = [session('s-1', M6), session('s-2', T3)]
        expect(defaultPickerValue({
            sessions, instanceTypes: TYPES,
            requirements: {minRamGiB: 8, minCpuCount: 2, minGpuCount: 0},
            groupSessionIds: ['s-2']
        })).toBe('session:s-1')
    })

    it('is unchanged when nothing of the group is running', () => {
        const sessions = [session('s-1', M6)]
        expect(defaultPickerValue({
            sessions, instanceTypes: TYPES,
            requirements: {minRamGiB: 8, minCpuCount: 2, minGpuCount: 0},
            groupSessionIds: []
        })).toBe('session:s-1')
    })
})
