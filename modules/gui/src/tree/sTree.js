import {assertValue} from '~/assertValue'

const TREE_NODE_KEY = '_sTree_'

export const ROOT_NODE = {
    [TREE_NODE_KEY]: true,
    path: []
}

export const TREE_NODE = {
    [TREE_NODE_KEY]: false
}

const assertNode = node =>
    assertValue(node, ({[TREE_NODE_KEY]: node}) => node !== undefined, `Tree: not a valid node: ${node}`, true)

const assertString = value =>
    assertValue(value, value => typeof value === 'string', `Tree: not a valid string: ${value}`, true)

const assertPath = value =>
    assertValue(value, value => Array.isArray(value), `Tree: not a valid path: ${value}`, true)

const assertNodeMapper = value =>
    assertValue(value, value => typeof value === 'function', 'Tree: not a valid node mapper', true)

const createRoot = value => {
    const rootNode = {
        ...ROOT_NODE
    }
    if (value) {
        rootNode.value = value
    }
    return rootNode
}

const isRoot = node => {
    assertNode(node)
    return node.path.length === 0
}

const createChildNode = (node, key, value) => {
    assertNode(node)
    assertString(key)
    const childNode = {
        ...TREE_NODE,
        path: [...node.path, key]
    }
    if (value) {
        childNode.value = value
    }
    if (!node.items) {
        node.items = {}
    }
    node.items[key] = childNode
    return childNode
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

const isLeaf = node => {
    assertNode(node)
    return node.items === undefined
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
}

const fromStringPath = stringPath => {
    assertString(stringPath)
    if (stringPath.charAt(0) !== '/') {
        throw Error('Invalid path:', stringPath)
    }
    return stringPath === '/'
        ? []
        : stringPath.split('/').slice(1)
}

const toStringPath = path =>
    '/' + path.join('/')

const getPath = node => {
    assertNode(node)
    return node.path
}

const getDepth = node =>
    getPath(node).length

const setValue = (node, value) => {
    assertNode(node)
    node.value = value
    return node
}

const getValue = node => {
    assertNode(node)
    return node.value
}

const updateValue = (node, callback) => {
    assertNode(node)
    return setValue(node, callback(getValue(node), getPath(node)))
}

const traverse = (node, path, create, callback) => {
    assertNode(node)
    assertPath(path)
    callback && callback(node)
    const [pathHead, ...pathTail] = path
    if (pathHead) {
        const childNode = getChildNode(node, pathHead)
            || create && createChildNode(node, pathHead)
        return childNode && pathTail.length
            ? traverse(childNode, pathTail, create, callback)
            : childNode
    } else {
        return node
    }
}

const traverseReduce = (node, path, callback, acc0) => {
    assertNode(node)
    assertPath(path)
    const acc = callback(acc0, getValue(node), getPath(node), node)
    const [pathHead, ...pathTail] = path
    return pathHead
        ? traverseReduce(getChildNode(node, pathHead), pathTail, callback, acc)
        : acc
}

const traverseFind = (node, path, callback) =>
    traverseReduce(node, path, (found, value, path, node) => found ? found : callback(value) && node, null)

const scan = (node, callback) =>
    Object.values(getChildNodes(node)).forEach(
        childNode => {
            callback(childNode)
            scan(childNode, callback)
        }
    )

const reduce = (node, callback, acc) =>
    Object.values(getChildNodes(node)).reduce(
        (acc, childNode) => reduce(childNode, callback, acc),
        callback(acc, getValue(node), getPath(node), node)
    )
    
const find = (node, callback) =>
    reduce(node, (found, value, _path, node) => found ? found : callback(value) && node, null)

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

const toArray = (node, nodeMapper = obj => obj) => {
    assertNode(node)
    assertNodeMapper(nodeMapper)
    const path = node.path
    const value = getValue(node)
    const items = Object.values(getChildNodes(node))
        .map(childNode => toArray(childNode, nodeMapper))
        .flat()
    return [nodeMapper({path, value}), ...items]
}

export const STree = {
    createRoot, isRoot, createChildNode, getChildNodes, getChildNode, isLeaf, removeChildNode,
    fromStringPath, toStringPath, getPath, getDepth, setValue, getValue, updateValue,
    traverse, traverseReduce, traverseFind, scan, reduce, find, toTree, toArray
}
