import {describe, expect, it} from 'vitest'

import {instanceSpecs} from './instanceSpecs'

describe('instanceSpecs', () => {
    it('lists cpu, memory and hourly price', () => {
        expect(instanceSpecs({cpuCount: 1, gpuCount: 0, ramGiB: 2, hourlyCost: 0.0204})).toBe('1 CPU · 2 GB · $0.02/h')
    })

    it('counts gpus between cpu and memory, only where there are any', () => {
        expect(instanceSpecs({cpuCount: 4, gpuCount: 1, ramGiB: 16, hourlyCost: 1.123})).toBe('4 CPU · 1 GPU · 16 GB · $1.12/h')
    })
})
