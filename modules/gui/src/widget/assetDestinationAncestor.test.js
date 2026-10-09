import {findNonContainerAncestor} from './assetDestinationAncestor'

describe('findNonContainerAncestor', () => {
    it('finds an existing image the destination would be placed inside', () => {
        const image = asset('projects/p/assets/test', 'Image')
        const assets = [root(), image]

        expect(findNonContainerAncestor('projects/p/assets/test/mosaic', assets)).toEqual(image)
    })

    it('finds a non-container ancestor above the immediate parent', () => {
        const table = asset('projects/p/assets/table', 'Table')
        const assets = [root(), table]

        expect(findNonContainerAncestor('projects/p/assets/table/missing/mosaic', assets)).toEqual(table)
    })

    it('allows destinations inside folders and image collections', () => {
        const assets = [
            root(),
            asset('projects/p/assets/folder', 'Folder'),
            asset('projects/p/assets/folder/collection', 'ImageCollection')
        ]

        expect(findNonContainerAncestor('projects/p/assets/folder/collection/mosaic', assets)).toBeUndefined()
    })

    it('allows destinations whose missing parent folders exports create', () => {
        expect(findNonContainerAncestor('projects/p/assets/new/mosaic', [root()])).toBeUndefined()
    })

    it('ignores the destination itself, which may be replaced', () => {
        const assets = [root(), asset('projects/p/assets/mosaic', 'Image')]

        expect(findNonContainerAncestor('projects/p/assets/mosaic', assets)).toBeUndefined()
    })

    it('ignores an asset whose name is only a prefix of a parent folder', () => {
        const assets = [root(), asset('projects/p/assets/mosaic', 'Image')]

        expect(findNonContainerAncestor('projects/p/assets/mosaic2/output', assets)).toBeUndefined()
    })

    it('ignores assets whose type is not known yet', () => {
        const assets = [root(), asset('projects/p/assets/pending')]

        expect(findNonContainerAncestor('projects/p/assets/pending/mosaic', assets)).toBeUndefined()
    })
})

const root = () => asset('projects/p/assets', 'Folder')

const asset = (id, type) => ({id, type})
