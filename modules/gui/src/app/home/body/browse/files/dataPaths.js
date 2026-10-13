export const isDataPath = path =>
    path === 'data' || path.startsWith('data/')

// The home listing always shows Data, which user-files does not list.
export const withDataNode = (path, items) =>
    path === ''
        ? {...items, data: {dir: true}}
        : items

export const splitByOwner = paths => ({
    files: paths.filter(path => !isDataPath(path)),
    data: paths.filter(isDataPath)
})
