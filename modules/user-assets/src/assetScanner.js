const _ = require('lodash')
const {userTag} = require('./tag')
const log = require('#sepal/log').getLogger('assetScanner')

const {tap, map, mergeWith, of, switchMap, catchError, from, Subject, finalize, reduce, throwError} = require('rxjs')
const {getUser} = require('./userStore')
const {STree} = require('#sepal/tree/sTree')
const {getAsset$} = require('./asset')
const {Limiter} = require('./limiter')
const {formatDistanceToNowStrict} = require('date-fns/formatDistanceToNowStrict')

const GLOBAL_CONCURRENCY = 10
const USER_CONCURRENCY = 2

const userLimiter$ = Limiter({
    name: 'user',
    concurrency: USER_CONCURRENCY,
    group: ({username}) => username
})

const globalLimiter$ = Limiter({
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
    log.info(`${userTag(username)} assets loading...`)
    const t0 = Date.now()
    increaseBusy(username)
    return loadNode$(username, [], true).pipe(
        reduce((tree, {path, nodes}) => addNodes(tree, path, nodes), createRoot()),
        tap(assets => log.info(`${userTag(username)} assets loaded ${formatDistanceToNowStrict(t0)}:`, getStats(assets))),
        finalize(() => decreaseBusy(username))
    )
}

const limiter$ = fn$ =>
    userLimiter$(() =>
        globalLimiter$(fn$)
    )

const loadNodeValidUser$ = (user, path, id) => {
    const t0 = Date.now()
    return getAsset$(user, id).pipe(
        tap(() => log.debug(`${userTag(user.username)} loaded: ${STree.toStringPath(path) || 'roots'} (${Date.now() - t0}ms)`)),
        catchError(error =>
            path.length
                ? of([])
                : throwError(() =>
                    new Error(`${userTag(user.username)} failed: ${STree.toStringPath(path) || 'roots'} (${Date.now() - t0}ms)`, {cause: error})
                )
        )
    )
}

const loadNodeMissingUser$ = (username, path) =>
    of([]).pipe(
        log.warn(`${userTag(username)} skipped: ${STree.toStringPath(path) || 'roots'} - user unavailable`)
    )

const loadNode$ = (username, path = [], node = {}) =>
    limiter$(() => from(getUser(username, {allowMissing: true})).pipe(
        switchMap(user => user
            ? loadNodeValidUser$(user, path, node.id)
            : loadNodeMissingUser$(username, path)
        )
    )).pipe(
        switchMap(nodes => of({path, nodes}).pipe(
            mergeWith(...loadNodes$(username, path, nodes))
        ))
    )

const loadNodes$ = (username, path, nodes) =>
    nodes
        .filter(({type}) => type === 'Folder')
        .map(node => loadNode$(username, [...path, getKey(node, path)], node))

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
