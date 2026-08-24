import {describe, expect, it} from 'vitest'

import {conflictingAssociations, groupApps, openPlan} from './appOpenPlan'

const LAB = {path: '/sandbox/jupyter/lab', label: 'Jupyter Lab', endpoint: 'jupyter'}
const NOTEBOOK = {path: '/sandbox/jupyter/tree', label: 'Jupyter Notebook', endpoint: 'jupyter'}
const VOILA = {path: '/sandbox/jupyter/voila/render/x/ui.ipynb', label: 'Voila App', endpoint: 'jupyter'}
const SHINY = {path: '/sandbox/shiny/foo', label: 'Foo', endpoint: 'shiny'}
const SHINY_BAR = {path: '/sandbox/shiny/bar', label: 'Bar', endpoint: 'shiny'}
const APPS = [LAB, NOTEBOOK, VOILA, SHINY, SHINY_BAR]

describe('groupApps', () => {
    it('groups every app of the same endpoint (jupyter: Lab, Notebook, voila apps)', () => {
        expect(groupApps(LAB, APPS)).toEqual([LAB, NOTEBOOK, VOILA])
        expect(groupApps(SHINY, APPS)).toEqual([SHINY, SHINY_BAR])
    })

    it('always includes the app itself, even when the catalog is not loaded', () => {
        expect(groupApps(SHINY, [])).toEqual([SHINY])
        expect(groupApps(SHINY, undefined)).toEqual([SHINY])
    })
})

describe('conflictingAssociations', () => {
    const sessions = [
        {id: 's-1', apps: [{path: '/sandbox/jupyter/lab', label: 'Jupyter Lab'}]},
        {id: 's-2', apps: [{path: '/sandbox/shiny/foo', label: 'Foo'}]},
        {id: 's-3'} // no apps
    ]

    it('finds the app\'s own live association', () => {
        expect(conflictingAssociations(SHINY, APPS, sessions)).toEqual([
            {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-2'}
        ])
    })

    it('finds same-endpoint associations for another app of the endpoint', () => {
        expect(conflictingAssociations(NOTEBOOK, APPS, sessions)).toEqual([
            {path: '/sandbox/jupyter/lab', label: 'Jupyter Lab', sessionId: 's-1'}
        ])
        expect(conflictingAssociations(SHINY_BAR, APPS, sessions)).toEqual([
            {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-2'}
        ])
    })

    it('is empty when nothing of the endpoint is associated', () => {
        expect(conflictingAssociations(SHINY, APPS, [{id: 's-9', apps: []}])).toEqual([])
        expect(conflictingAssociations(SHINY, APPS, undefined)).toEqual([])
    })
})

describe('openPlan', () => {
    it('opens plainly with no conflicts', () => {
        expect(openPlan({app: SHINY, selection: {instanceType: 'T3aSmall'}, conflicts: [], tabs: []}))
            .toEqual({action: 'open'})
    })

    it('focuses the local tab when the app is open HERE and the same instance is picked', () => {
        const conflicts = [{path: SHINY.path, label: 'Foo', sessionId: 's-1'}]
        const tabs = [{id: 't-1', path: SHINY.path, sessionId: 's-1'}]
        expect(openPlan({app: SHINY, selection: {sessionId: 's-1'}, conflicts, tabs}))
            .toEqual({action: 'focus', tabId: 't-1'})
    })

    it('confirms a same-instance open when the app is open in ANOTHER browser (no local tab)', () => {
        const conflicts = [{path: SHINY.path, label: 'Foo', sessionId: 's-1'}]
        const plan = openPlan({app: SHINY, selection: {sessionId: 's-1'}, conflicts, tabs: []})
        expect(plan.action).toBe('confirm')
        expect(plan.reason).toBe('otherBrowser')
        expect(plan.sessionId).toBe('s-1')
        expect(plan.toRelease).toEqual([SHINY.path])
        expect(plan.toCloseLocal).toEqual([])
    })

    it('confirms a local move to a different instance, closing the local tab', () => {
        const conflicts = [{path: SHINY.path, label: 'Foo', sessionId: 's-1'}]
        const tabs = [{id: 't-1', path: SHINY.path, sessionId: 's-1'}]
        const plan = openPlan({app: SHINY, selection: {sessionId: 's-2'}, conflicts, tabs})
        expect(plan.action).toBe('confirm')
        expect(plan.reason).toBe('otherInstance')
        expect(plan.sessionId).toBe('s-1')
        expect(plan.toRelease).toEqual([SHINY.path])
        expect(plan.toCloseLocal).toEqual(['t-1'])
    })

    it('confirms a new-instance pick too (instanceType selection ≠ current session)', () => {
        const conflicts = [{path: SHINY.path, label: 'Foo', sessionId: 's-1'}]
        const plan = openPlan({app: SHINY, selection: {instanceType: 'M6aXlarge'}, conflicts, tabs: []})
        expect(plan.action).toBe('confirm')
    })

    it('joins a group-mate\'s instance silently (Notebook onto Lab\'s instance)', () => {
        const conflicts = [{path: LAB.path, label: 'Jupyter Lab', sessionId: 's-1'}]
        expect(openPlan({app: NOTEBOOK, selection: {sessionId: 's-1'}, conflicts, tabs: []}))
            .toEqual({action: 'open'})
    })

    it('confirms a group move to a NEW instance, closing every group member', () => {
        const conflicts = [{path: LAB.path, label: 'Jupyter Lab', sessionId: 's-1'}]
        const tabs = [{id: 't-lab', path: LAB.path, sessionId: 's-1'}]
        const plan = openPlan({app: NOTEBOOK, selection: {instanceType: 'M6aXlarge'}, conflicts, tabs})
        expect(plan.action).toBe('confirm')
        expect(plan.reason).toBe('group')
        expect(plan.sessionId).toBe('s-1')
        expect(plan.toRelease).toEqual([LAB.path])
        expect(plan.toCloseLocal).toEqual(['t-lab'])
        expect(plan.closing).toEqual([{path: LAB.path, label: 'Jupyter Lab'}])
    })

    it('moving an open grouped app closes its group-mates too', () => {
        // Lab AND Notebook open on s-1; Lab re-opened onto s-2 → both close first.
        const conflicts = [
            {path: LAB.path, label: 'Jupyter Lab', sessionId: 's-1'},
            {path: NOTEBOOK.path, label: 'Jupyter Notebook', sessionId: 's-1'}
        ]
        const tabs = [
            {id: 't-lab', path: LAB.path, sessionId: 's-1'},
            {id: 't-nb', path: NOTEBOOK.path, sessionId: 's-1'}
        ]
        const plan = openPlan({app: LAB, selection: {sessionId: 's-2'}, conflicts, tabs})
        expect(plan.action).toBe('confirm')
        expect(plan.reason).toBe('otherInstance')
        expect(plan.toRelease).toEqual([LAB.path, NOTEBOOK.path])
        expect(plan.toCloseLocal).toEqual(['t-lab', 't-nb'])
    })

    it('re-opening an open grouped app on the SAME instance moves only the app itself', () => {
        // Lab open in another browser on s-1; Notebook stays untouched on s-1.
        const conflicts = [
            {path: LAB.path, label: 'Jupyter Lab', sessionId: 's-1'},
            {path: NOTEBOOK.path, label: 'Jupyter Notebook', sessionId: 's-1'}
        ]
        const plan = openPlan({app: LAB, selection: {sessionId: 's-1'}, conflicts, tabs: []})
        expect(plan.action).toBe('confirm')
        expect(plan.reason).toBe('otherBrowser')
        expect(plan.toRelease).toEqual([LAB.path])
    })
})
