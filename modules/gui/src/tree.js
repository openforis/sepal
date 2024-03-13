import {assertValue} from '~/assertValue'
import _ from 'lodash'

export const NODE_KEY = '_node_'

const assertNode = node =>
    assertValue(node, ({[NODE_KEY]: node}) => !!node, `Tree: not a valid node: ${node}`, true)

const assertPath = path =>
    assertValue(path, _.isArray, 'Tree: not a valid path', true)

const assertNodeMapper = nodeMapper =>
    assertValue(nodeMapper, _.isFunction, 'Tree: not a valid nodeMapper', true)

const assertNodeMatcher = nodeMatcher =>
    assertValue(nodeMatcher, _.isFunction, 'Tree: not a valid nodeMatcher', true)

const createNode = (path = [], value, children) => ({
    [NODE_KEY]: {path, value},
    ...children
})

const createPath = (node, path, currentPath = node[NODE_KEY].path) => {
    assertNode(node)
    assertPath(path)
    const [pathHead, ...pathTail] = path
    if (pathHead) {
        if (!node[pathHead]) {
            node[pathHead] = createNode([...currentPath, pathHead])
        }
        return pathTail.length
            ? createPath(node[pathHead], pathTail, [...currentPath, pathHead])
            : node[pathHead]
    } else {
        return node
    }
}

const traversePath = (node, path) => {
    assertNode(node)
    assertPath(path)
    const [pathHead, ...pathTail] = path
    if (pathHead) {
        return pathTail.length
            ? traversePath(node[pathHead], pathTail)
            : node[pathHead]
    } else {
        return node
    }
}

const setValue = (node, path, value) => {
    assertNode(node)
    assertPath(path)
    const targetNode = createPath(node, path)
    targetNode[NODE_KEY].value = value
    return node
}

const getValue = (node, path = []) => {
    assertNode(node)
    assertPath(path)
    const targetNode = traversePath(node, path)
    return targetNode && targetNode[NODE_KEY].value
}

const getChildNodes = node => {
    assertNode(node)
    return _(node)
        .omit([NODE_KEY])
        .values()
        .value()
}

const unwrap = node => {
    assertNode(node)
    return {
        props: node[NODE_KEY],
        nodes: getChildNodes(node)
    }
}

const flatten = (node, nodeMapper = obj => obj, depth = 0) => {
    assertNode(node)
    assertNodeMapper(nodeMapper)
    const {path, value} = node[NODE_KEY] || {}
    return [
        nodeMapper({path, value, depth}),
        ...getChildNodes(node)
            .map(child => flatten(child, nodeMapper, depth + 1))
            .flat()
    ]
}

const filter = (node, nodeMatcher, maxDepth = Number.POSITIVE_INFINITY) => {
    assertNode(node)
    assertNodeMatcher(nodeMatcher)
    const matchingChildren = maxDepth > 0
        ? _(node)
            .omit([NODE_KEY])
            .mapValues(item => filter(item, nodeMatcher, maxDepth - 1))
            .pickBy(
                item => !_.isEmpty(getChildNodes(item))
                || nodeMatcher({path: item[NODE_KEY].path, value: item[NODE_KEY].value})
            )
            .value()
        : {}
    return createNode(node[NODE_KEY].path, node[NODE_KEY].value, matchingChildren)
}

export const Tree = {
    createNode, createPath, setValue, getValue, getChildNodes, unwrap, flatten, filter
}
