const _ = require('lodash')
const {userTag} = require('./tag')
const log = require('#sepal/log').getLogger('assetScanner')

const {tap, map, mergeWith, of, switchMap, catchError, from, Subject, finalize, reduce, throwError} = require('rxjs')
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

const globalLimiter$ = Limiter({
    name: 'global',
    concurrency: GLOBAL_CONCURRENCY
})

const progress = {}
const busy = {}
const busy$ = new Subject()

const getProgress = username =>
    progress[username] || 0

const increaseProgress = username => {
    if (getProgress(username)) {
        progress[username]++
    } else {
        progress[username] = 1
    }
    busy$.next({username, status: {busy: true, progress: getProgress(username)}})
}

const resetProgress = username => {
    delete progress[username]
}

const increaseBusy = username => {
    if (busy[username]) {
        busy[username]++
    } else {
        busy[username] = 1
        busy$.next({username, status: {busy: true, progress: getProgress(username)}})
    }
}

const decreaseBusy = username => {
    if (busy[username]) {
        if (busy[username] > 1) {
            busy[username]--
        } else {
            delete busy[username]
            busy$.next({username, status: {busy: false}})
        }
    }
}

const isBusy = username =>
    !!busy[username]

const createRoot = () =>
    STree.createRoot()

const createNode = path =>
    STree.createNode(path)

const addNode = (tree, path, item) => {
    STree.setValue(
        STree.traverse(tree, [...path, getKey(item, path)], true),
        {type: item.type, updateTime: item.updateTime, quota: item.quota}
    )
    return tree
}

const addNodes = (tree, path, nodes = []) =>
    nodes.reduce((tree, node) => addNode(tree, path, node), tree)

const getKey = ({id}, path) => {
    const len = path.join('/').length
    return id.substr(len ? len + 1 : 0)
}

const scanTree$ = username => {
    increaseBusy(username)
    return loadNode$(username, [], true).pipe(
        reduce((tree, {path, nodes}) => addNodes(tree, path, nodes), createRoot()),
        finalize(() => {
            resetProgress(username)
            decreaseBusy(username)
        })
    )
}

const limiter$ = fn$ =>
    userLimiter$(() =>
        globalLimiter$(fn$)
    )

const loadNodeValidUser$ = (user, path, id) => {
    const t0 = Date.now()
    log.trace(`${userTag(user.username)} loading: ${STree.toStringPath(path) || 'roots'}`)
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
        tap(() => log.warn(`${userTag(username)} skipped: ${STree.toStringPath(path) || 'roots'} - user unavailable`))
    )

const loadNode$ = (username, path = [], node = {}) =>
    limiter$(() => from(getUser(username, {allowMissing: true})).pipe(
        tap(() => increaseProgress(username)),
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
    log.debug(`${userTag(username)} loading:`, STree.toStringPath(path))
    increaseBusy(username)
    log.trace(`${userTag(username)} loading:`, STree.toStringPath(path))
    return from(getUser(username)).pipe(
        switchMap(user => getAsset$(user, STree.toStringPath(path))),
        tap(() => log.debug(`${userTag(username)} loaded:`, STree.toStringPath(path))),
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
