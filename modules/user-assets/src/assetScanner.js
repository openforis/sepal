const _ = require('lodash')
const {userTag} = require('./tag')
const log = require('#sepal/log').getLogger('assetScanner')

const {tap, map, mergeWith, of, switchMap, catchError, from, Subject, finalize, reduce} = require('rxjs')
const {getUser} = require('./userStore')
const {STree} = require('#sepal/tree/sTree')
const {getAsset$} = require('./asset')
const {Limiter} = require('./limiter')

const GLOBAL_CONCURRENCY = 10
const USER_CONCURRENCY = 2

const userLimiter$ = Limiter({
    name: 'user',
    concurrency: USER_CONCURRENCY,
    group: ({username}) => username
})

const globalLimiter = Limiter({
    name: 'global',
    concurrency: GLOBAL_CONCURRENCY
})

const busy = {}
const busy$ = new Subject()

const increaseBusy = username => {
    if (busy[username]) {
        busy[username]++
    } else {
        busy[username] = 1
        busy$.next({username, busy: true})
    }
}

const decreaseBusy = username => {
    if (busy[username]) {
        if (busy[username] > 1) {
            busy[username]--
        } else {
            delete busy[username]
            busy$.next({username, busy: false})
        }
    }
}

const isBusy = username =>
    !!busy[username]

const createRoot = () =>
    STree.createRoot()

const createNode = path =>
    STree.createNode(path)

const addNode = (tree, path, item) =>
    STree.alter(tree, tree =>
        STree.setValue(
            STree.traverse(tree, [...path, getKey(item, path)], true),
            {type: item.type, updateTime: item.updateTime, quota: item.quota}
        )
    )

const addNodes = (tree, path, nodes = []) =>
    nodes.reduce((tree, node) => addNode(tree, path, node), tree)

const getKey = ({id}, path) => {
    const len = path.join('/').length
    return id.substr(len ? len + 1 : 0)
}

const getStats = assets =>
    STree.reduce(assets, (acc, {value: {type} = {}}) => (type ? {
        ...acc,
        [type]: (acc[type] || 0) + 1
    } : acc), {})

const scanTree$ = username => {
    log.info(`${userTag(username)} assets loading`)
    increaseBusy(username)
    const cancel$ = new Subject()
    return from(getUser(username)).pipe(
        switchMap(user =>
            loadNode$(user, [], true).pipe(
                finalize(() => cancel$.next()),
                reduce((tree, {path, nodes}) => addNodes(tree, path, nodes), createRoot()),
                tap({
                    next: assets => log.info(`${userTag(username)} assets loading:`, getStats(assets)),
                    error: error => log.warn(`${userTag(username)} assets failed`, error),
                    complete: () => log.info(`${userTag(username)} assets loaded`)
                })
            )
        ),
        finalize(() => decreaseBusy(username))
    )
}

const loadNode$ = (user, path = [], node = {}) =>
    userLimiter$(() => globalLimiter(() => getAsset$(user, node.id))).pipe(
        switchMap(nodes => of({path, nodes}).pipe(
            mergeWith(...loadNodes$(user, path, nodes))
        ))
    )

const loadNodes$ = (user, path, nodes) =>
    nodes
        .filter(({type}) => type === 'Folder')
        .map(node => loadNode$(user, [...path, getKey(node, path)], node).pipe(
            catchError(error => {
                log.warn(`${userTag(user.username)} failed to load assets ${path.length ? path.slice(-1) : 'roots'}`, error)
                return of([])
            })
        ))

const scanNode$ = (username, path) => {
    log.debug(`${userTag(username)} loading node:`, path)
    increaseBusy(username)
    return from(getUser(username)).pipe(
        switchMap(user => getAsset$(user, STree.toStringPath(path))),
        map(childNodes => {
            const node = createNode(path)
            childNodes.forEach(
                childNode => STree.addChildNode(
                    node,
                    getKey(childNode, path),
                    {type: childNode.type, quota: childNode.quota, updateTime: childNode.updateTime}
                )
            )
            return node
        }),
        finalize(() => decreaseBusy(username))
    )
}

module.exports = {scanTree$, scanNode$, busy$, isBusy}
