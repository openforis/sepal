import {normalizeAppsCatalog} from './appsCatalog'

describe('normalizeAppsCatalog', () => {
    it('passes single-container apps through unchanged', () => {
        const input = {apps: [{id: 'rstudio', endpoint: 'rstudio', path: '/x'}]}
        const out = normalizeAppsCatalog(input)
        expect(out.apps).toEqual([{id: 'rstudio', endpoint: 'rstudio', path: '/x'}])
    })

    it('emits hidden parent and flattened children for multiapp parent', () => {
        const input = {
            apps: [{
                id: 'sepal-gee-bundle',
                label: 'Bundle',
                endpoint: 'docker',
                repository: 'r',
                branch: 'main',
                port: 8765,
                path: '/api/app-launcher/sepal-gee-bundle',
                googleAccountRequired: true,
                apps: [
                    {id: 'gfc', route: 'gfc', label: 'GFC', tags: ['FOREST']},
                    {id: 'fcdm', route: 'fcdm', label: 'FCDM'}
                ]
            }]
        }
        const out = normalizeAppsCatalog(input)
        expect(out.apps).toHaveLength(3)

        const [parent, gfc, fcdm] = out.apps
        expect(parent.id).toBe('sepal-gee-bundle')
        expect(parent.endpoint).toBe('docker')
        expect(parent.hidden).toBe(true)
        expect(parent).not.toHaveProperty('apps')

        expect(gfc.path).toBe('/api/app-launcher/sepal-gee-bundle/gfc')
        expect(gfc.endpoint).toBe('docker')
        expect(gfc.containerApp).toBe('sepal-gee-bundle')
        expect(gfc.googleAccountRequired).toBe(true)
        expect(gfc.tags).toEqual(['FOREST'])
        expect(gfc).not.toHaveProperty('repository')

        expect(fcdm.tags).toEqual([])
    })

    it('ignores endpoint set on a bundle child and inherits parent endpoint', () => {
        const input = {
            apps: [{
                id: 'sepal-gee-bundle',
                endpoint: 'docker',
                path: '/api/app-launcher/sepal-gee-bundle',
                apps: [{
                    id: 'gee_source',
                    route: 'gee_source',
                    label: 'GEE source',
                    endpoint: 'jupyter'
                }]
            }]
        }
        const out = normalizeAppsCatalog(input)
        const child = out.apps[1]
        expect(child.endpoint).toBe('docker')
        expect(child.containerApp).toBe('sepal-gee-bundle')
        expect(child.path).toBe('/api/app-launcher/sepal-gee-bundle/gee_source')
    })

    it('falls back to parent.path + child.id when route is absent', () => {
        const input = {apps: [{
            id: 'p', path: '/api/p', endpoint: 'docker',
            apps: [{id: 'a', label: 'A'}]
        }]}
        expect(normalizeAppsCatalog(input).apps[1].path).toBe('/api/p/a')
    })

    it('honors explicit child.path over derived path', () => {
        const input = {apps: [{
            id: 'p', path: '/api/p', endpoint: 'docker',
            apps: [{id: 'a', route: 'a', path: '/explicit', label: 'A'}]
        }]}
        expect(normalizeAppsCatalog(input).apps[1].path).toBe('/explicit')
    })

    it('preserves non-whitelisted child fields like single and alt', () => {
        const input = {apps: [{
            id: 'p', path: '/api/p', endpoint: 'docker',
            apps: [{id: 'a', route: 'a', label: 'A', single: true, alt: 'X'}]
        }]}
        const child = normalizeAppsCatalog(input).apps[1]
        expect(child.single).toBe(true)
        expect(child.alt).toBe('X')
    })

    it('merges parent tags into bundle children, deduped', () => {
        const input = {apps: [{
            id: 'p', path: '/api/p', endpoint: 'docker', tags: ['INSTANT'],
            apps: [
                {id: 'a', route: 'a', label: 'A', tags: ['FOREST']},
                {id: 'b', route: 'b', label: 'B', tags: ['INSTANT', 'SAR']}
            ]
        }]}
        const out = normalizeAppsCatalog(input)
        expect(out.apps[1].tags).toEqual(['INSTANT', 'FOREST'])
        expect(out.apps[2].tags).toEqual(['INSTANT', 'SAR'])
    })

    it('lets child override inherited googleAccountRequired', () => {
        const input = {apps: [{
            id: 'p', path: '/api/p', endpoint: 'docker', googleAccountRequired: true,
            apps: [{id: 'a', route: 'a', label: 'A', googleAccountRequired: false}]
        }]}
        expect(normalizeAppsCatalog(input).apps[1].googleAccountRequired).toBe(false)
    })
})
