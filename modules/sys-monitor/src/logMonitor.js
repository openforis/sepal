const Tail = require('tail-file')
const {sepalServerLog, autoRearmDelayHours} = require('./config')
const log = require('#sepal/log').getLogger('logMonitor')
const {Subject, groupBy, debounceTime, mergeMap, map, tap} = require('rxjs')
const _ = require('lodash')
const {notify} = require('./email')

const rules = require('#config/logMonitor.json')

const tag$ = new Subject()

const getTimeout = tag => rules[tag].timeout

const getEmail = tag => rules[tag].email || {}

tag$.pipe(
    groupBy(({tag}) => tag),
    mergeMap(group$ => group$.pipe(
        tap(({tag, activate}) => activate ? activateRule(tag) : acknowledgeRule(tag)),
        map(({tag}) => tag),
        debounceTime(getTimeout(group$.key) * 1000)
    ))
).subscribe(
    tag => triggerRule(tag)
)

const activateRule = tag => {
    log.info(`Rule activated: ${tag} (${getTimeout(tag)}sec)`)
}

const acknowledgeRule = tag => {
    log.debug(`Rule acknowledged: ${tag} (${getTimeout(tag)}sec)`)
}

const triggerRule = tag => {
    log.info(`Rule triggered: ${tag}`)
    notify({subject: `Rule ${tag} triggered on ${new Date().toUTCString()}`, ...getEmail(tag)})
}

const processLine = line =>
    _.forEach(rules, (rule, tag) => {
        if (line.includes(rule.match)) {
            tag$.next({tag})
        }
    })

const activateRules = () =>
    _.forEach(rules, (_rule, tag) => tag$.next({tag, activate: true}))

const start = () => {
    const tail = new Tail(sepalServerLog)
    tail.on('error', err => {throw(err)})
    tail.on('line', line => processLine(line))
    tail.on('restart', reason => {
        if(reason == 'PRIMEFOUND') log.debug('Now we can finally start tailing. File has appeared')
        if(reason == 'NEWPRIME') log.debug('We will switch over to the new file now')
        if(reason == 'TRUNCATE') log.debug('The file got smaller. I will go up and continue')
        if(reason == 'CATCHUP') log.debug('We found a start in an earlier file and are now moving to the next one in the list')
    })
    
    if (autoRearmDelayHours) {
        log.info(`Auto re-arming every ${autoRearmDelayHours}h`)
        setInterval(activateRules, autoRearmDelayHours * 3600 * 1000)
    }
    activateRules()

    tail.start()

    log.info('Started')
    notify({subject: 'Log monitoring started'})
}

module.exports = {start}
