const Asset = require('./asset')

it('can resolve legacy root', () => {
    const root = Asset({id: 'users/someUser/some/asset/path'})
        .getRoot()
    expect(root).toBe('users/someUser')
})

it('can resolve project root', () => {
    const root = Asset({id: 'projects/someProject/assets/some/asset/path'})
        .getRoot()
    expect(root).toBe('projects/someProject/assets')
})

it('returns null for invalid asset ID', () => {
    const root = Asset({id: 'an/invalid/asset/id'})
        .getRoot()
    expect(root).toBe(null)
})

it('returns asset IDs of folders', () => {
    const root = Asset({id: 'users/someUser/two/folders/asset'})
        .getFolders()
    expect(root).toEqual(['users/someUser/two', 'users/someUser/two/folders'])
})

it('returns empty list when there is no folder', () => {
    const root = Asset({id: 'users/someUser/asset'})
        .getFolders()
    expect(root).toEqual([])
})
