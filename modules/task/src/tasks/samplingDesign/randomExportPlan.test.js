import {EMPTY, lastValueFrom, of, toArray} from 'rxjs'

import {randomExportPlan$} from './randomExportPlan.js'

const PROGRESS_PREFIX = 'tasks.samplingDesign.random.progress.'
const stageKeys = emissions => emissions
    .filter(value => value?.messageKey?.startsWith(PROGRESS_PREFIX))
    .map(value => value.messageKey.slice(PROGRESS_PREFIX.length))

describe('randomExportPlan$', () => {
    it('emits prepare -> check -> export final, validating then exporting the samples', async () => {
        const validateCalls = []
        const exportCalls = []
        const result$ = randomExportPlan$({
            samples$: of('samples'),
            validate$: samples => {
                validateCalls.push(samples)
                return of('validated')
            },
            export$: samples => {
                exportCalls.push(samples)
                return of('exported')
            }
        })
        const emissions = await lastValueFrom(result$.pipe(toArray()))
        expect(stageKeys(emissions)).toEqual(['prepareCandidates', 'checkCandidates', 'exportFinal'])
        expect(validateCalls).toEqual(['samples'])
        expect(exportCalls).toEqual(['samples'])
        expect(emissions.at(-1)).toBe('exported')
    })

    it('swallows validate output (its guard result never becomes task progress)', async () => {
        const result$ = randomExportPlan$({
            samples$: of('samples'),
            validate$: () => of('validate-output'),
            export$: () => of('exported')
        })
        const emissions = await lastValueFrom(result$.pipe(toArray()))
        expect(emissions).not.toContain('validate-output')
    })

    it('passes through the export EE progress', async () => {
        const eeProgress = {state: 'RUNNING', messageKey: 'tasks.ee.export.running', defaultMessage: 'Google Earth Engine is exporting'}
        const result$ = randomExportPlan$({
            samples$: of('samples'),
            validate$: () => EMPTY,
            export$: () => of(eeProgress, 'exported')
        })
        const emissions = await lastValueFrom(result$.pipe(toArray()))
        expect(emissions).toContainEqual(eeProgress)
    })
})
