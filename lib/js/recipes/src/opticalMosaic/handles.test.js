const {getHandles} = require('./handles')

const REQUIRED_V1_HANDLES = [
    // user-required (no sensible default — must be supplied to create a valid recipe)
    'aoi',
    // source / render speed
    'datasets', 'sceneCloudLimit', 'corrections', 'sceneSelection',
    'filters', 'compose', 'tileOverlap', 'orbitOverlap',
    // cloud masking
    'cloudMethods', 'sepalCloudScoreMax', 's2CloudScoreBand',
    's2CloudScoreMax', 's2CloudProbabilityMax', 'landsatCloudMask',
    'landsatShadowMask', 'landsatCirrusMask', 'landsatDilatedCloud',
    'snowMasking', 'holes', 'cloudBuffer',
    // BRDF / date basics
    'brdfMultiplier', 'targetDate', 'seasonStart', 'seasonEnd',
    'yearsBefore', 'yearsAfter'
]

describe('MOSAIC.handles — required v1 catalog', () => {

    function names() {
        return getHandles().map(handle => handle.name)
    }

    function byName(name) {
        return getHandles().find(handle => handle.name === name)
    }

    it.each(REQUIRED_V1_HANDLES)('exposes the required v1 handle %s', name => {
        expect(names()).toContain(name)
    })

    it('produces unique handle names', () => {
        const seen = names()
        expect(seen.length).toBe(new Set(seen).size)
    })

    it('produces unique internal paths', () => {
        const paths = getHandles().map(handle => handle.path)
        expect(paths.length).toBe(new Set(paths).size)
    })

    it('returns short lower-camel handle names', () => {
        for (const name of names()) {
            expect(name).toMatch(/^[a-z][a-zA-Z0-9]*$/)
        }
    })

    it('returns fresh objects each call so consumers cannot mutate the source', () => {
        const first = getHandles()
        first.push({name: 'injected', path: '/x'})
        first[0].path = '/mutated'

        const second = getHandles()
        expect(second.some(handle => handle.name === 'injected')).toBe(false)
        expect(second[0].path).not.toBe('/mutated')
    })

    describe('handle->path mapping', () => {

        it.each([
            ['aoi', '/aoi'],
            ['datasets', '/sources/dataSets'],
            ['sceneCloudLimit', '/sources/cloudPercentageThreshold'],
            ['corrections', '/compositeOptions/corrections'],
            ['sceneSelection', '/sceneSelectionOptions/type'],
            ['filters', '/compositeOptions/filters'],
            ['compose', '/compositeOptions/compose'],
            ['tileOverlap', '/compositeOptions/tileOverlap'],
            ['orbitOverlap', '/compositeOptions/orbitOverlap'],
            ['cloudMethods', '/compositeOptions/includedCloudMasking'],
            ['sepalCloudScoreMax', '/compositeOptions/sepalCloudScoreMaxCloudProbability'],
            ['s2CloudScoreBand', '/compositeOptions/sentinel2CloudScorePlusBand'],
            ['s2CloudScoreMax', '/compositeOptions/sentinel2CloudScorePlusMaxCloudProbability'],
            ['s2CloudProbabilityMax', '/compositeOptions/sentinel2CloudProbabilityMaxCloudProbability'],
            ['landsatCloudMask', '/compositeOptions/landsatCFMaskCloudMasking'],
            ['landsatShadowMask', '/compositeOptions/landsatCFMaskCloudShadowMasking'],
            ['landsatCirrusMask', '/compositeOptions/landsatCFMaskCirrusMasking'],
            ['landsatDilatedCloud', '/compositeOptions/landsatCFMaskDilatedCloud'],
            ['snowMasking', '/compositeOptions/snowMasking'],
            ['holes', '/compositeOptions/holes'],
            ['cloudBuffer', '/compositeOptions/cloudBuffer'],
            ['brdfMultiplier', '/compositeOptions/brdfMultiplier'],
            ['targetDate', '/dates/targetDate'],
            ['seasonStart', '/dates/seasonStart'],
            ['seasonEnd', '/dates/seasonEnd'],
            ['yearsBefore', '/dates/yearsBefore'],
            ['yearsAfter', '/dates/yearsAfter']
        ])('%s -> %s', (name, path) => {
            expect(byName(name)?.path).toBe(path)
        })

        it('maps datasets to the whole source-membership object, not to a per-group child', () => {
            expect(byName('datasets').path).toBe('/sources/dataSets')
        })

        it('maps filters to the whole filters array, not to per-item handles', () => {
            expect(byName('filters').path).toBe('/compositeOptions/filters')
            const handles = getHandles()
            expect(handles.filter(handle => handle.path.startsWith('/compositeOptions/filters/'))).toEqual([])
        })

        it('does not expose any handle whose path indexes into an array (no per-array-item handles)', () => {
            for (const handle of getHandles()) {
                expect(handle.path).not.toMatch(/\/\d+(\/|$)/)
            }
        })
    })

    describe('granularity rules — no group handles, no 1-to-many handles', () => {

        const FORBIDDEN_GROUP_NAMES = ['cloudMasking', 'performance', 'render', 'dateWindow', 'season']

        it.each(FORBIDDEN_GROUP_NAMES)('does not expose group handle %s', name => {
            expect(names()).not.toContain(name)
        })

        it('declares exactly one path per handle (no 1-to-many handles in v1)', () => {
            for (const handle of getHandles()) {
                expect(typeof handle.path).toBe('string')
                expect(handle).not.toHaveProperty('paths')
            }
        })
    })

    describe('handle metadata content', () => {

        it('provides a non-empty description for every handle', () => {
            for (const handle of getHandles()) {
                expect(typeof handle.description).toBe('string')
                expect(handle.description.trim().length).toBeGreaterThan(0)
            }
        })

        it('provides a non-empty user-facing label for every handle', () => {
            for (const handle of getHandles()) {
                expect(typeof handle.label).toBe('string')
                expect(handle.label.trim().length).toBeGreaterThan(0)
                expect(handle.label).not.toBe(handle.name)
            }
        })

        it('declares allowedValues for the enum-bearing handles', () => {
            expect(byName('compose').allowedValues).toEqual(['MEDOID', 'MEDIAN'])
            expect(byName('snowMasking').allowedValues).toEqual(['ON', 'OFF'])
            expect(byName('holes').allowedValues).toEqual(['PREVENT', 'ALLOW'])
            expect(byName('tileOverlap').allowedValues).toEqual(['KEEP', 'QUICK_REMOVE', 'REMOVE'])
            expect(byName('orbitOverlap').allowedValues).toEqual(['KEEP', 'REMOVE'])
            expect(byName('cloudBuffer').allowedValues).toEqual([0, 120, 600])
            expect(byName('sceneSelection').allowedValues).toEqual(['ALL', 'SELECT'])
            expect(byName('s2CloudScoreBand').allowedValues).toEqual(['cs', 'cs_cdf'])
            for (const name of ['landsatCloudMask', 'landsatShadowMask', 'landsatCirrusMask']) {
                expect(byName(name).allowedValues).toEqual(['OFF', 'MODERATE', 'AGGRESSIVE'])
            }
            expect(byName('landsatDilatedCloud').allowedValues).toEqual(['KEEP', 'REMOVE'])
        })

        it('declares allowed items for the cloudMethods array handle as rich item objects', () => {
            expect(byName('cloudMethods').allowedItems.map(item => item.value)).toEqual([
                'sepalCloudScore', 'landsatCFMask',
                'sentinel2CloudScorePlus', 'sentinel2CloudProbability', 'pino26'
            ])
        })

        it('declares allowed items for the corrections array handle', () => {
            expect(byName('corrections').allowedItems).toEqual(['SR', 'BRDF', 'CALIBRATE'])
        })

        describe('rich selector-item metadata (generic mechanism, MOSAIC cloudMethods fixture)', () => {

            function cloudItem(value) {
                return byName('cloudMethods').allowedItems.find(item => item.value === value)
            }

            it('every rich item carries a value + label', () => {
                for (const item of byName('cloudMethods').allowedItems) {
                    expect(typeof item.value).toBe('string')
                    expect(typeof item.label).toBe('string')
                    expect(item.label.length).toBeGreaterThan(0)
                }
            })

            it('sentinel2CloudScorePlus declares applicability, alternative group, companions, and moderate/aggressive profiles', () => {
                const item = cloudItem('sentinel2CloudScorePlus')
                expect(item.label).toBe('Sentinel-2 Cloud Score+')
                expect(item.appliesTo).toEqual(['SENTINEL_2'])
                expect(item.alternativeGroup).toBe('sentinel2CloudMask')
                expect(item.companionHandles).toEqual(['s2CloudScoreBand', 's2CloudScoreMax'])
                expect(item.profiles.moderate).toEqual({s2CloudScoreBand: 'cs_cdf', s2CloudScoreMax: 45})
                expect(item.profiles.aggressive).toEqual({s2CloudScoreBand: 'cs', s2CloudScoreMax: 35})
            })

            it('sentinel2CloudProbability and pino26 share the sentinel2CloudMask alternative group with Cloud Score+', () => {
                expect(cloudItem('sentinel2CloudProbability').alternativeGroup).toBe('sentinel2CloudMask')
                expect(cloudItem('pino26').alternativeGroup).toBe('sentinel2CloudMask')
            })

            it('landsatCFMask declares Landsat-only applicability and its own alternative group with full companion profile', () => {
                const item = cloudItem('landsatCFMask')
                expect(item.appliesTo).toEqual(['LANDSAT'])
                expect(item.alternativeGroup).toBe('landsatCloudMask')
                expect(item.companionHandles).toEqual(['landsatCloudMask', 'landsatShadowMask', 'landsatCirrusMask', 'landsatDilatedCloud'])
                expect(item.profiles.aggressive).toMatchObject({landsatCloudMask: 'AGGRESSIVE', landsatShadowMask: 'AGGRESSIVE', landsatCirrusMask: 'AGGRESSIVE'})
            })

            it('sepalCloudScore applies to both source groups and carries threshold profiles', () => {
                const item = cloudItem('sepalCloudScore')
                expect(item.appliesTo).toEqual(['LANDSAT', 'SENTINEL_2'])
                expect(item.companionHandles).toEqual(['sepalCloudScoreMax'])
                expect(item.profiles.moderate).toEqual({sepalCloudScoreMax: 30})
                expect(item.profiles.aggressive).toEqual({sepalCloudScoreMax: 25})
            })

            it('derives valueLabels from rich items so summarizers can read either shape', () => {
                expect(byName('cloudMethods').valueLabels).toEqual({
                    sepalCloudScore: 'SEPAL Cloud Score',
                    landsatCFMask: 'Landsat CFMask',
                    sentinel2CloudScorePlus: 'Sentinel-2 Cloud Score+',
                    sentinel2CloudProbability: 'Sentinel-2 Cloud Probability',
                    pino26: 'PINO26'
                })
            })

            describe('applicability is grounded by a scope handle (no fail-open metadata)', () => {

                it('every selector-item appliesTo key in the catalog is declared by exactly one scope handle', () => {
                    expect(applicabilityScopeFailures(getHandles())).toEqual([])
                })

                it('the grounding check flags an appliesTo key that no scope handle declares', () => {
                    const failures = applicabilityScopeFailures([
                        {name: 'fooMethods', allowedItems: [{value: 'someMethod', appliesTo: ['NO_SCOPE']}]}
                    ])

                    expect(failures).toEqual([
                        expect.objectContaining({selectorHandle: 'fooMethods', item: 'someMethod', key: 'NO_SCOPE', declarers: []})
                    ])
                })

                it('the grounding check flags an appliesTo key declared by more than one scope handle', () => {
                    const failures = applicabilityScopeFailures([
                        {name: 'scopeA', allowedKeys: {DUP: []}},
                        {name: 'scopeB', allowedKeys: {DUP: []}},
                        {name: 'fooMethods', allowedItems: [{value: 'someMethod', appliesTo: ['DUP']}]}
                    ])

                    expect(failures).toEqual([
                        expect.objectContaining({selectorHandle: 'fooMethods', item: 'someMethod', key: 'DUP', declarers: ['scopeA', 'scopeB']})
                    ])
                })
            })
        })

        describe('valueLabels translate tokens into user-facing prose', () => {

            it('maps tileOverlap tokens to user-facing phrases', () => {
                expect(byName('tileOverlap').valueLabels).toEqual({
                    KEEP: 'keep overlap',
                    QUICK_REMOVE: 'quickly remove overlap',
                    REMOVE: 'fully remove overlap'
                })
            })

            it('maps cloudMethods tokens to vendor-named methods (not the raw enum tokens)', () => {
                const labels = byName('cloudMethods').valueLabels
                expect(labels.sepalCloudScore).toBe('SEPAL Cloud Score')
                expect(labels.landsatCFMask).toBe('Landsat CFMask')
                expect(labels.sentinel2CloudScorePlus).toBe('Sentinel-2 Cloud Score+')
            })

            it('maps corrections tokens to plain phrases', () => {
                expect(byName('corrections').valueLabels).toEqual({
                    SR: 'surface reflectance',
                    BRDF: 'BRDF correction',
                    CALIBRATE: 'cross-sensor calibration'
                })
            })

            it('maps datasets group + dataset codes to user-facing names', () => {
                const labels = byName('datasets').valueLabels
                expect(labels.LANDSAT).toBe('Landsat')
                expect(labels.SENTINEL_2).toBe('Sentinel-2')
                expect(labels.LANDSAT_9).toBe('Landsat 9')
            })

            it('lowers severity-style enums (ON/OFF, MODERATE/AGGRESSIVE) into prose-friendly labels', () => {
                expect(byName('snowMasking').valueLabels).toEqual({ON: 'on', OFF: 'off'})
                expect(byName('landsatCloudMask').valueLabels).toEqual({OFF: 'off', MODERATE: 'moderate', AGGRESSIVE: 'aggressive'})
            })

            it('never reuses the raw enum token as the label', () => {
                for (const handle of getHandles()) {
                    if (!handle.valueLabels) continue
                    for (const [token, label] of Object.entries(handle.valueLabels)) {
                        expect(label).not.toBe(token)
                    }
                }
            })
        })

        describe('examples — optional, handle-keyed, show valid value shape', () => {

            it('shows config-array members that preserve existing entries', () => {
                expect(byName('cloudMethods').examples).toContainEqual(['sepalCloudScore', 'landsatCFMask'])
                expect(byName('corrections').examples).toContainEqual(['SR', 'BRDF'])
            })

            it('shows whole-object datasets shapes for common Landsat / mixed-source choices', () => {
                expect(byName('datasets').examples).toContainEqual({LANDSAT: ['LANDSAT_9', 'LANDSAT_8']})
                expect(byName('datasets').examples).toContainEqual({LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']})
            })

            it('shows typical numeric thresholds for cloud-score handles', () => {
                expect(byName('sepalCloudScoreMax').examples).toEqual([30, 25])
                expect(byName('s2CloudScoreMax').examples).toEqual([45, 35])
            })

            it('every example is a plain JSON-serialisable value (no functions, no paths)', () => {
                for (const handle of getHandles()) {
                    if (!handle.examples) continue
                    for (const example of handle.examples) {
                        expect(typeof example).not.toBe('function')
                        expect(JSON.stringify(example)).not.toMatch(/"\/[a-z]/i)
                    }
                }
            })
        })

        describe('performanceNote / summaryGuidance — optional but well-formed when present', () => {

            it('flags filters and cloudBuffer (the costliest knobs) with a performanceNote', () => {
                expect(byName('filters').performanceNote).toMatch(/cost|reduction|costly/i)
                expect(byName('cloudBuffer').performanceNote).toMatch(/spatial|expensive/i)
            })

            it('every performanceNote is a non-empty string', () => {
                for (const handle of getHandles()) {
                    if (handle.performanceNote === undefined) continue
                    expect(typeof handle.performanceNote).toBe('string')
                    expect(handle.performanceNote.trim().length).toBeGreaterThan(0)
                }
            })

            it('every summaryGuidance is a non-empty string', () => {
                for (const handle of getHandles()) {
                    if (handle.summaryGuidance === undefined) continue
                    expect(typeof handle.summaryGuidance).toBe('string')
                    expect(handle.summaryGuidance.trim().length).toBeGreaterThan(0)
                }
            })
        })
    })
})

describe('MOSAIC.handles — userRequired (no sensible default; user must supply)', () => {

    function userRequired() {
        return getHandles().filter(handle => handle.userRequired === true)
    }

    it('marks aoi as userRequired (no default geometry can be invented)', () => {
        expect(getHandles().find(handle => handle.name === 'aoi').userRequired).toBe(true)
    })

    it('does not mark routinely-defaultable handles as userRequired', () => {
        for (const name of ['cloudMethods', 'corrections', 'cloudBuffer', 'snowMasking', 'targetDate']) {
            expect(getHandles().find(handle => handle.name === name).userRequired).toBeUndefined()
        }
    })

    it('every userRequired handle carries valueGuidance explaining where its value must come from', () => {
        for (const handle of userRequired()) {
            expect(typeof handle.valueGuidance).toBe('string')
            expect(handle.valueGuidance.trim().length).toBeGreaterThan(0)
        }
    })
})

describe('MOSAIC.handles — aoi anti-geocoding guidance', () => {

    function aoi() {
        return getHandles().find(handle => handle.name === 'aoi')
    }

    it('maps to the whole /aoi object (not a per-field handle)', () => {
        expect(aoi().path).toBe('/aoi')
    })

    it('forbids inventing geometry from place names — instruction must come from a real AOI object', () => {
        const guidance = aoi().valueGuidance
        expect(guidance).toMatch(/do not.*(geocode|invent|guess)/i)
        expect(guidance).toMatch(/(clarif|ask)/i)
    })

    it('exposes allowed AOI shapes (POLYGON, EE_TABLE) for the updater to pick the right structure', () => {
        const aoiHandle = aoi()
        const items = aoiHandle.allowedItems || aoiHandle.allowedValues || []
        expect(JSON.stringify(items)).toMatch(/POLYGON/)
        expect(JSON.stringify(items)).toMatch(/EE_TABLE/)
    })
})

// Inverts the catalog: collects each `appliesTo` key from rich selector items
// and resolves it against the scope handles that declare it via `allowedKeys`.
// A key with zero declarers is fail-open metadata (the applicability check
// would silently treat it as "no conflict"); a key with multiple declarers is
// ambiguous (the runtime picks one arbitrarily).
function applicabilityScopeFailures(handles) {
    const scopeDeclarers = new Map()
    for (const handle of handles) {
        if (!handle.allowedKeys) continue
        for (const key of Object.keys(handle.allowedKeys)) {
            const list = scopeDeclarers.get(key) || []
            list.push(handle.name)
            scopeDeclarers.set(key, list)
        }
    }
    const failures = []
    for (const handle of handles) {
        if (!Array.isArray(handle.allowedItems)) continue
        for (const item of handle.allowedItems) {
            if (!Array.isArray(item?.appliesTo)) continue
            for (const key of item.appliesTo) {
                const declarers = scopeDeclarers.get(key) || []
                if (declarers.length !== 1) {
                    failures.push({selectorHandle: handle.name, item: item.value, key, declarers})
                }
            }
        }
    }
    return failures
}
