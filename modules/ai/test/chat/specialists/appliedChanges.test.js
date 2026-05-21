const {parseValueLabels, enrichOperations} = require('#mcp/chat/specialists/appliedChanges')

describe('parseValueLabels', () => {

    const text = [
        '/options/mode: A(alpha)|B(beta)',
        '/options/methods: landsatCFMask(Landsat CFMask)|sentinel2CloudScorePlus(Sentinel-2 Cloud Score+)'
    ].join('\n')

    it('maps each path to its raw-value -> label dictionary', () => {
        expect(parseValueLabels(text)).toEqual({
            '/options/mode': {A: 'alpha', B: 'beta'},
            '/options/methods': {landsatCFMask: 'Landsat CFMask', sentinel2CloudScorePlus: 'Sentinel-2 Cloud Score+'}
        })
    })

    it('returns an empty map for empty or missing input', () => {
        expect(parseValueLabels('')).toEqual({})
        expect(parseValueLabels(undefined)).toEqual({})
    })
})

describe('enrichOperations', () => {

    const labelsByPath = {
        '/options/mode': {OFF: 'off', AGGRESSIVE: 'aggressive'},
        '/options/methods': {landsatCFMask: 'Landsat CFMask', sentinel2CloudScorePlus: 'Sentinel-2 Cloud Score+'}
    }

    it('labels a scalar enum value while keeping the raw value', () => {
        const [change] = enrichOperations([{op: 'replace', path: '/options/mode', value: 'AGGRESSIVE'}], labelsByPath)

        expect(change).toEqual({op: 'replace', path: '/options/mode', value: 'AGGRESSIVE', valueLabel: 'aggressive'})
    })

    it('labels each member of a config array, keeping the raw array', () => {
        const [change] = enrichOperations([{op: 'replace', path: '/options/methods', value: ['landsatCFMask', 'sentinel2CloudScorePlus']}], labelsByPath)

        expect(change).toEqual({
            op: 'replace',
            path: '/options/methods',
            value: ['landsatCFMask', 'sentinel2CloudScorePlus'],
            valueLabels: ['Landsat CFMask', 'Sentinel-2 Cloud Score+']
        })
    })

    it('falls back to the raw member when an array item has no label', () => {
        const [change] = enrichOperations([{op: 'replace', path: '/options/methods', value: ['landsatCFMask', 'unknownMethod']}], labelsByPath)

        expect(change.valueLabels).toEqual(['Landsat CFMask', 'unknownMethod'])
    })

    it('keeps an object value compact with no invented label', () => {
        const [change] = enrichOperations([{op: 'replace', path: '/options/obj', value: {a: 1}}], labelsByPath)

        expect(change).toEqual({op: 'replace', path: '/options/obj', value: {a: 1}})
    })

    it('keeps a scalar with no labelled path as raw, without failing', () => {
        const [change] = enrichOperations([{op: 'replace', path: '/options/unlabeled', value: 'Z'}], labelsByPath)

        expect(change).toEqual({op: 'replace', path: '/options/unlabeled', value: 'Z'})
    })

    it('omits value for operations that carry none (e.g. remove)', () => {
        const [change] = enrichOperations([{op: 'remove', path: '/options/mode'}], labelsByPath)

        expect(change).toEqual({op: 'remove', path: '/options/mode'})
    })
})
