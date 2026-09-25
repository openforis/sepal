import {describe, expect, it} from 'vitest'

import {instanceSpecs} from './instanceSpecs'

describe('instanceSpecs', () => {
    it('lists cpu, memory and hourly price', () => {
        expect(instanceSpecs({cpuCount: 1, gpuCount: 0, ramGiB: 2, hourlyCost: 0.0204})).toBe('1 CPU · 2 GB · $0.02/h')
    })

    it('counts gpus between cpu and memory, only where there are any', () => {
        expect(instanceSpecs({cpuCount: 4, gpuCount: 1, ramGiB: 16, hourlyCost: 1.123})).toBe('4 CPU · 1 GPU · 16 GB · $1.12/h')
    })

    it('adds local SSD capacity, only where there is any, and performance relative to t1 as a multiplier', () => {
        expect(instanceSpecs({cpuCount: 4, gpuCount: 0, ramGiB: 32, ssdGB: 237, performance: 4.3, hourlyCost: 0.3696}))
            .toBe('4 CPU · 32 GB · 237 GB SSD · 4.3× · $0.37/h')
        expect(instanceSpecs({cpuCount: 2, gpuCount: 0, ramGiB: 8, ssdGB: 0, performance: 1.8, hourlyCost: 0.0963}))
            .toBe('2 CPU · 8 GB · 1.8× · $0.10/h')
    })

    it('leaves out SSD capacity and performance when compact', () => {
        expect(instanceSpecs({cpuCount: 4, gpuCount: 1, ramGiB: 16, ssdGB: 250, performance: 3.0, hourlyCost: 1.123}, {compact: true}))
            .toBe('4 CPU · 1 GPU · 16 GB · $1.12/h')
    })
})
