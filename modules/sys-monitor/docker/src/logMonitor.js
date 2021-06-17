const Tail = require('tail-file')
const {sepalServerLog} = require('./config')
const log = require('sepal/log').getLogger('logMonitor')
const {Subject} = require('rxjs')
const {groupBy, debounceTime, mergeMap, map, tap} = require('rxjs/operators')
const _ = require('lodash')
const {notify} = require('./email')

const rules = require('./logMonitor.json')

const tag$ = new Subject()

const getTimeout = tag => rules[tag].timeout

const getEmail = tag => rules[tag].email || {}

tag$.pipe(
    groupBy(({tag}) => tag),
    mergeMap(group$ => group$.pipe(
        tap(({tag, warmup}) => tagDetected(tag, warmup)),
        map(({tag}) => tag),
        debounceTime(getTimeout(group$.key) * 1000)
    ))
).subscribe(
    tag => tagExpected(tag)
)

const tagDetected = (tag, warmup) => {
    if (warmup) {
        log.info(`Rule armed: ${tag} (${getTimeout(tag)}sec)`)
    } else {
        log.debug(`Rule re-armed: ${tag} (${getTimeout(tag)}sec)`)
    }
}

const tagExpected = tag => {
    log.info(`Rule triggered: ${tag}`)
    notify({subject: `Rule ${tag} triggered on ${new Date().toUTCString()}`, ...getEmail(tag)})
}

const processLine = line =>
    _.forEach(rules, (rule, tag) => {
        if (line.includes(rule.match)) {
            tag$.next({tag})
        }
    })

const warmUpTags = () =>
    _.forEach(rules, (rule, tag) => tag$.next({tag, warmup: true}))

const start = () => {
    const mytail = new Tail(sepalServerLog)
    mytail.on('error', err => {throw(err)})
    mytail.on('line', line => processLine(line))
    mytail.on('restart', reason => {
        if(reason == 'PRIMEFOUND') log.debug('Now we can finally start tailing. File has appeared')
        if(reason == 'NEWPRIME') log.debug('We will switch over to the new file now')
        if(reason == 'TRUNCATE') log.debug('The file got smaller. I will go up and continue')
        if(reason == 'CATCHUP') log.debug('We found a start in an earlier file and are now moving to the next one in the list')
    })
     
    warmUpTags()

    mytail.start()

    log.info('Log monitoring started')
    notify({subject: 'Log monitoring ready'})

}

module.exports = {start}
