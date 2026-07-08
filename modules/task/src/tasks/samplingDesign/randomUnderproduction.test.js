import {lastValueFrom, of, throwError} from 'rxjs'

import {validateRandomCounts} from './randomUnderproduction.js'

const allocation = [
    {stratum: 1, label: 'trees', sampleSize: 373},
    {stratum: 7, label: 'bare', sampleSize: 100}
]

const settle = obs => lastValueFrom(obs).then(value => ({value}), error => ({error}))

describe('validateRandomCounts', () => {
    it('passes counts through when every stratum meets its requested size', async () => {
        const counts = {1: 400, 7: 100}
        const {value, error} = await settle(of(counts).pipe(validateRandomCounts({allocation, hasMinDistance: true})))
        expect(error).toBeUndefined()
        expect(value).toBe(counts)
    })

    it('throws a structured ClientException with the minDistance user message on a shortfall', async () => {
        const {error} = await settle(of({1: 373, 7: 40}).pipe(validateRandomCounts({allocation, hasMinDistance: true})))
        expect(error).toBeInstanceOf(Error)
        expect(error.userMessage.key).toBe('tasks.samplingDesign.random.underproduced.minDistance')
        expect(error.userMessage.args.strata).toBe('bare (stratum 7): 40 available / 100 requested')
    })

    it('uses the insufficient-area user message when there is no minDistance', async () => {
        const {error} = await settle(of({1: 0, 7: 0}).pipe(validateRandomCounts({allocation, hasMinDistance: false})))
        expect(error.userMessage.key).toBe('tasks.samplingDesign.random.underproduced.insufficientArea')
    })

    it('propagates an unrelated upstream error unchanged (does not wrap it as underproduction)', async () => {
        const upstream = new Error('EE getInfo failed')
        const {error} = await settle(throwError(() => upstream).pipe(validateRandomCounts({allocation, hasMinDistance: true})))
        expect(error).toBe(upstream)
        expect(error.userMessage).toBeUndefined()
    })
})
