import {assertValue} from 'assertValue'
import _ from 'lodash'

const ID = 'id'
const PROPS = 'props'
const ITEMS = 'items'

const assertNode = node =>
    assertValue(node, _.isObject, 'node must be provided', true)

const assertItems = items =>
    assertValue(items, _.isArray, 'items must be provided', true)

const assertId = id =>
    assertValue(id, _.isString, 'id must be provided', true)

const assertPath = path =>
    assertValue(path, _.isArray, 'path must be provided', true)

const assertProps = props =>
    assertValue(props, _.isObject, 'props must be provided', true)

const assertProp = prop =>
    assertValue(prop, _.isString, 'prop must be provided', true)

const getNodePath = path =>
    _.compact([...path.map(item => [ITEMS, item]).flat()]).join('.')

const getPropertiesPath = path =>
    _.compact([getNodePath(path), PROPS]).join('.')

const getPropertyPath = (path, property) =>
    [getPropertiesPath(path), property].join('.')

const getItemsPath = path =>
    _.compact([getNodePath(path), ITEMS]).join('.')

const getItemPath = (path, property) =>
    [getItemsPath(path), property].join('.')

const createNode = (id, props, items) => ({
    [ID]: id,
    [PROPS]: props,
    [ITEMS]: items
})

const getNode = (tree, path) => {
    assertNode(tree)
    assertPath(path)
    return _.get(tree, getNodePath(path))
}

const setNode = (tree, path, id, props) => {
    assertNode(tree)
    assertPath(path)
    assertId(id)
    assertProps(props)
    _.set(tree, getItemPath(path, id), createNode(id, props))
    return tree
}

const setItems = (tree, path, items) => {
    assertNode(tree)
    assertPath(path)
    assertItems(items)
    const nodes = items.reduce(
        (acc, {id, ...props}) => ({
            ...acc,
            [id]: {
                [ID]: id,
                [PROPS]: props,
                [ITEMS]: _.get(tree, getItemsPath([...path, id]))
            }
        }),
        {}
    )
    _.set(tree, getItemsPath(path), nodes)
    return tree
}

const getProperties = (tree, path) => {
    assertNode(tree)
    assertPath(path)
    return _.get(tree, getPropertiesPath(path))
}

const setProperties = (tree, path, props) => {
    assertNode(tree)
    assertPath(path)
    assertProps(props)
    _.set(tree, getPropertiesPath(path), props)
}

const getProperty = (tree, path, prop) => {
    assertNode(tree)
    assertPath(path)
    assertProp(prop)
    return _.get(tree, getPropertyPath(path, prop))
}

const setProperty = (tree, path, prop, value) => {
    assertNode(tree)
    assertPath(path)
    assertProp(prop)
    _.set(tree, getPropertyPath(path, prop), value)
}

const flatten = (node = {}, path = [], depth = 0) => {
    assertNode(node)
    assertPath(path)
    const {[PROPS]: props, [ITEMS]: items} = node
    const childItems = _.map(items,
        (node, id) => flatten(node, [...path, id], depth + 1)
    )
    return _.compact([
        path.length ? {path, props, depth} : null,
        ...childItems
    ]).flat()
}

const filter = (node = {}, matcher) => {
    assertNode(node)
    const filteredItems = _(node[ITEMS])
        .mapValues(item => filter(item, matcher))
        .pickBy(item => !_.isEmpty(item[ITEMS]) || matcher(item[ID], item[PROPS]))
        .value()
    return createNode(node[ID], node[PROPS], filteredItems)
}

export const Tree = {
    createNode, getNode, setNode, setItems, getProperties, setProperties, getProperty, setProperty, flatten, filter
}
