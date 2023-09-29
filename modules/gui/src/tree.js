import {assertValue} from 'assertValue'
import _ from 'lodash'

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

const createNode = props => ({
    [PROPS]: props
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
    _.set(tree, getItemPath(path, id), createNode(props))
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
                props,
                items: _.get(tree, getItemsPath([...path, id]))
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

const flatten = (node = {}, path = []) => {
    assertNode(node)
    assertPath(path)
    const {[PROPS]: props, [ITEMS]: items} = node
    const childItems = _.map(items,
        (node, id) => flatten(node, [...path, id])
    )
    return _.compact([
        path.length ? {path, props} : null,
        ...childItems
    ]).flat()
}

export const Tree = {
    createNode, getNode, setNode, setItems, getProperties, setProperties, getProperty, setProperty, flatten
}
