import {assertValue} from '~/assertValue'

const NODE_KEY = '_sTree_'

export const NODE = {
    [NODE_KEY]: true
}

// helpers

const assertNode = node =>
    assertValue(node, ({[NODE_KEY]: node}) => node !== undefined, `Tree: not a valid node: ${node}`, true)

const assertString = value =>
    assertValue(value, value => typeof value === 'string', `Tree: not a valid string: ${value}`, true)

const assertPath = value =>
    assertValue(value, value => Array.isArray(value), `Tree: not a valid path: ${value}`, true)

const assertNodeMapper = value =>
    assertValue(value, value => typeof value === 'function', 'Tree: not a valid node mapper', true)

const fromStringPath = stringPath => {
    assertString(stringPath)
    if (stringPath.startsWith('/')) {
        throw new Error('Absolute path not allowed')
    }
    return stringPath === ''
        ? []
        : stringPath.split('/')
}

const toStringPath = path => {
    assertPath(path)
    return path.join('/')
}

// safe operations

const createRoot = value =>
    createNode([], value)

const createNode = (path, value) => {
    assertPath(path)
    const node = {
        ...NODE,
        path
    }
    if (value) {
        node.value = value
    }
    return node
}

const isRoot = node => {
    assertNode(node)
    return node.path.length === 0
}

const isLeaf = node => {
    assertNode(node)
    return node.items === undefined
}

const getChildNodes = node => {
    assertNode(node)
    return node.items || {}
}

const getChildNode = (node, key) => {
    assertNode(node)
    assertString(key)
    return node.items && node.items[key]
}

const getPath = node => {
    assertNode(node)
    return node.path
}

const getKey = node => {
    assertNode(node)
    return getPath(node).at(-1)
}

const getDepth = node => {
    assertNode(node)
    return getPath(node).length
}

const getValue = node => {
    assertNode(node)
    return node.value
}

const traverse = (node, path, create, callback) => {
    assertNode(node)
    assertPath(path)
    callback && callback(node)
    const [pathHead, ...pathTail] = path
    if (pathHead) {
        const childNode = getChildNode(node, pathHead) || create && addChildNode(node, pathHead)
        return childNode && traverse(childNode, pathTail, create, callback)
    } else {
        return node
    }
}

const traverseReduce = (node, path, reducer, acc0) => {
    assertNode(node)
    assertPath(path)
    const acc = reducer(acc0, {
        path: getPath(node),
        key: getKey(node),
        value: getValue(node)
    })
    const [pathHead, ...pathTail] = path
    return pathHead
        ? traverseReduce(getChildNode(node, pathHead), pathTail, reducer, acc)
        : acc
}

const traverseFind = (node, path, finder) => {
    assertNode(node)
    assertPath(path)
    if (finder({
        path: getPath(node),
        key: getKey(node),
        value: getValue(node)
    })) {
        return node
    } else {
        const [pathHead, ...pathTail] = path
        return pathHead && traverseFind(getChildNode(node, pathHead), pathTail, finder)
    }
}

const clone = (node, filterPredicate, parentClonedNode) => {
    assertNode(node)
    const key = getKey(node)
    const value = getValue(node)
    const clonedNode = parentClonedNode ? addChildNode(parentClonedNode, key, value) : createRoot(value)
    Object.values(getChildNodes(node)).forEach(
        childNode => clone(childNode, filterPredicate, clonedNode)
    )
    if (filterPredicate && !isRoot(clonedNode) && isLeaf(clonedNode) && !filterPredicate(clonedNode)) {
        removeChildNode(parentClonedNode, getKey(clonedNode))
    }
    return clonedNode
}

const cloneNode = node => {
    assertNode(node)
    const clonedNode = createNode(getPath(node), getValue(node))
    return clonedNode
}

const scan = (node, callback, {minDepth = 0, maxDepth = Number.MAX_SAFE_INTEGER} = {}) => {
    assertNode(node)
    if (minDepth <= 0) {
        callback(node)
    }
    if (maxDepth > 0) {
        Object.values(getChildNodes(node)).forEach(
            childNode => scan(childNode, callback, {minDepth: minDepth - 1, maxDepth: maxDepth - 1})
        )
    }
}

const reduce = (node, callback, acc) => {
    assertNode(node)
    return Object.values(getChildNodes(node)).reduce(
        (acc, childNode) => reduce(childNode, callback, acc),
        callback(acc, {
            path: getPath(node),
            key: getKey(node),
            value: getValue(node)
        })
    )
}
    
const find = (node, finder) => {
    assertNode(node)
    const queue = [node]
    while (queue.length) {
        const node = queue.shift()
        if (finder({
            path: getPath(node),
            key: getKey(node),
            value: getValue(node)
        })) {
            return node
        }
        queue.push(...Object.values(getChildNodes(node)))
    }
}
    
const toTree = (node, nodeMapper = obj => obj) => {
    assertNode(node)
    assertNodeMapper(nodeMapper)
    const path = node.path
    const value = getValue(node)
    const items = Object.entries(getChildNodes(node))
        .reduce(
            (tree, [key, childNode]) => ({...tree, [key]: toTree(childNode, nodeMapper)}),
            {}
        )
    return {...nodeMapper({path, value, items})}
}

const toArray = (node, nodeMapper = obj => obj, depth = 0) => {
    assertNode(node)
    assertNodeMapper(nodeMapper)
    const path = node.path
    const value = getValue(node)
    const items = Object.values(getChildNodes(node))
        .map(childNode => toArray(childNode, nodeMapper, depth + 1))
        .flat()
    return [nodeMapper({path, value, depth}), ...items]
}

const alter = (node, op) => {
    assertNode(node)
    if (node.clone) {
        op(node)
        return node
    } else {
        const clonedNode = clone(node)
        clonedNode.clone = true
        op(clonedNode)
        delete clonedNode.clone
        return clonedNode
    }
}

// unsafe operations

const addChildNode = (node, key, value) => {
    assertNode(node)
    assertString(key)
    const childNode = createNode([...node.path, key], value)
    if (!node.items) {
        node.items = {}
    }
    node.items[key] = childNode
    return childNode
}

const removeChildNode = (node, key) => {
    assertNode(node)
    assertString(key)
    if (node.items) {
        delete node.items[key]
        if (Object.keys(node.items).length === 0) {
            delete node.items
        }
    }
    return node
}

const setValue = (node, value) => {
    assertNode(node)
    node.value = value
    return node
}

const updateValue = (node, callback) => {
    assertNode(node)
    return setValue(node, callback(getValue(node), getPath(node)))
}

export const STree = {
    createRoot, createNode, addChildNode, removeChildNode, getChildNodes, getChildNode, isRoot, isLeaf,
    fromStringPath, toStringPath, getPath, getKey, getDepth, setValue, getValue, updateValue,
    traverse, traverseReduce, traverseFind, cloneNode, clone, scan, reduce, find, toTree, toArray, alter
}
