const _ = require('lodash')
const {userTag} = require('./tag')
const log = require('#sepal/log').getLogger('assetScanner')

const {tap, map, mergeWith, of, switchMap, catchError, scan, takeLast, EMPTY, from, throttleTime, Subject, groupBy, mergeMap, filter, finalize} = require('rxjs')
const {getUser} = require('./userStore')
const {STree} = require('#sepal/tree/sTree')
const {getAsset$} = require('./asset')

const busy$ = new Subject()

const userBusy$ = busy$.pipe(
    groupBy(({username}) => username),
    mergeMap(username$ => username$.pipe(
        scan(({count}, {username, busy, free}) => ({
            username,
            count: count + (busy ? 1 : 0) - (free ? 1 : 0),
            busy: !!(count === 0 && busy),
            free: !!(count === 1 && free),
        }), {
            count: 0
        })
    )),
    filter(({busy, free}) => busy || free),
    map(({username, busy}) => ({username, busy}))
)

const createRoot = () =>
    STree.createRoot()

const createNode = path =>
    STree.createNode(path)

const addNode = (tree, path, item) =>
    STree.setValue(
        STree.traverse(tree, [...path, getKey(item, path)], true),
        {type: item.type, updateTime: item.updateTime, quota: item.quota}
    )

const addNodes = (tree, path, items) => {
    items.forEach(node => addNode(tree, path, node))
    return tree

}

const getKey = ({id}, path) => {
    const len = path.join('/').length
    return id.substr(len ? len + 1 : 0)
}

const scanTree$ = (username, {incremental = false, throttle = 1000} = {}) => {
    log.debug(`${userTag(username)} loading tree`)
    busy$.next({username, busy: true})
    return from(getUser(username)).pipe(
        switchMap(user =>
            loadNode$(user, [], true).pipe(
                scan((tree, {path, nodes}) => addNodes(tree, path, nodes), createRoot()),
                incremental
                    ? throttleTime(throttle, null, {leading: true, trailing: true})
                    : takeLast(1),
                tap({
                    complete: () => log.info(`${userTag(username)} assets loaded`)
                }),
                catchError(error => {
                    log.warn(`${userTag(username)} assets failed`, error)
                    return EMPTY
                })
            )
        ),
        finalize(() => busy$.next({username, free: true}))
    )
}

const loadNode$ = (user, path = [], recursive, node = {}) =>
    getAsset$(user, node.id).pipe(
        tap(() => log.trace(`${userTag(user.username)} loading assets ${path.length ? path.slice(-1) : 'roots'}`)),
        catchError(error => {
            log.warn(`${userTag(user.username)} failed to load assets ${path.length ? path.slice(-1) : 'roots'}`, error)
            return of([])
        }),
        switchMap(nodes => of({path, nodes}).pipe(
            tap(() => log.debug(`${userTag(user.username)} loaded assets ${path.length ? path.slice(-1) : 'roots'}`)),
            mergeWith(...(recursive ? loadNodes$(user, path, recursive, nodes) : []))
        ))
    )

const loadNodes$ = (user, path, recursive, nodes) =>
    nodes
        .filter(({type}) => type === 'Folder')
        .map(node => loadNode$(user, [...path, getKey(node, path)], recursive, node))

const scanNode$ = (username, path) => {
    log.debug(`${userTag(username)} loading node:`, path)
    busy$.next({username, busy: true})
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
        finalize(() => busy$.next({username, free: true}))
    )
}

module.exports = {scanTree$, scanNode$, userBusy$}
