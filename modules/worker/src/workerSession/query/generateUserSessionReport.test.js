import {generateUserSessionReport} from './generateUserSessionReport.js'

const session = overrides => ({
    id: 's1', username: 'alice', workerType: 'sandbox', instanceType: 'T3aSmall',
    instance: {id: 'i-1', host: '1.2.3.4'},
    ...overrides,
})

const deps = ({sessions, apps = new Map(), usage = new Map(), terminals, verdicts} = {}) => ({
    repo: {userSessions: async () => sessions},
    appRepo: {appsForSessions: async () => apps},
    usageRepo: {latestForSessions: async () => usage},
    instanceManager: {getInstanceTypes: () => [{id: 'T3aSmall'}]},
    terminals,
    verdicts,
})

const query = {username: 'alice', workerType: 'sandbox'}

describe('generateUserSessionReport', () => {
    it('enriches each session with its apps and latest usage sample', async () => {
        const report = await generateUserSessionReport(query, deps({
            sessions: [session()],
            apps: new Map([['s1', [{path: '/sandbox/shiny/foo', label: 'Foo'}]]]),
            usage: new Map([['s1', {cpuPct: 12, netBytesPerS: 300}]]),
        }))
        expect(report.sessions[0].apps).toEqual([{path: '/sandbox/shiny/foo', label: 'Foo'}])
        expect(report.sessions[0].usage).toEqual({cpuPct: 12, netBytesPerS: 300})
    })

    // Both live in the sampler's in-memory registries; the report is the only path by which they
    // reach the GUI, which lists what is running on each instance and why it counts as used.
    it('enriches each session with its terminal count and busy verdict', async () => {
        const report = await generateUserSessionReport(query, deps({
            sessions: [session()],
            terminals: {get: id => id === 's1' ? 2 : 0},
            verdicts: {get: id => id === 's1' ? 'busy' : 'unknown'},
        }))
        expect(report.sessions[0].terminals).toBe(2)
        expect(report.sessions[0].verdict).toBe('busy')
    })

    // The registries are optional collaborators (a worker started without the sampler still serves
    // the report), and their absence must read as "nothing observed" rather than as a verdict.
    it('reports no terminals and an unknown verdict without the sampler registries', async () => {
        const report = await generateUserSessionReport(query, deps({sessions: [session()]}))
        expect(report.sessions[0].terminals).toBe(0)
        expect(report.sessions[0].verdict).toBe('unknown')
    })
})
