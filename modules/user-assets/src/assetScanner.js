const _ = require('lodash')
const {userTag} = require('./tag')
const log = require('#sepal/log').getLogger('assetScanner')

const {tap, map, mergeWith, of, switchMap, catchError, from, Subject, finalize, reduce, throwError, takeUntil} = require('rxjs')
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

const scanTree$ = (username, abort$) => {
    log.info(`${userTag(username)} assets loading...`)
    const t0 = Date.now()
    increaseBusy(username)
    return loadNode$(username, [], true, abort$).pipe(
        reduce((tree, {path, nodes}) => addNodes(tree, path, nodes), createRoot()),
        tap(assets => log.info(`${userTag(username)} assets loaded in ${formatDistanceToNowStrict(t0)}:`, getStats(assets))),
        finalize(() => decreaseBusy(username))
    )
}

const limiter$ = fn$ =>
    userLimiter$(() =>
        globalLimiter$(fn$)
    )

const loadNode$ = (username, path = [], node = {}, abort$) => {
    return limiter$(() => from(getUser(username)).pipe(
        switchMap(user => getAsset$(user, node.id)),
        tap(() => log.debug(`${userTag(username)} loaded:`, STree.toStringPath(path) || 'roots')),
        catchError(error => {
            log.warn(`${userTag(username)} failed: ${STree.toStringPath(path) || 'roots'} -`, error)
            return path.length
                ? of([])
                : throwError(() => error)
        }),
        takeUntil(abort$)
    )).pipe(
        switchMap(nodes => of({path, nodes}).pipe(
            mergeWith(...loadNodes$(username, path, nodes, abort$))
        ))
    )
}

const loadNodes$ = (username, path, nodes, abort$) =>
    nodes
        .filter(({type}) => type === 'Folder')
        .map(node => loadNode$(username, [...path, getKey(node, path)], node, abort$))

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
