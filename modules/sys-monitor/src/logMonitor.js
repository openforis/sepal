import _ from 'lodash'
import {debounceTime, groupBy, map, mergeMap, Subject, tap} from 'rxjs'
import Tail from 'tail-file'

import rules from '#config/logMonitor.json' with {type: 'json'}
import {getLogger} from '#sepal/log'

import {autoRearmDelayHours, sepalServerLog} from './config.js'
import {notify} from './pushover.js'

const log = getLogger('logMonitor')

const tag$ = new Subject()

const getTimeout = tag => rules[tag].timeout
const getPriority = tag => rules[tag].priority

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
    notify({message: `Rule ${tag} triggered`, priority: getPriority(tag)})
}

const processLine = line => {
    log.debug('Processing line:', line)
    _.forEach(rules, (rule, tag) => {
        if (line.includes(rule.match)) {
            tag$.next({tag})
        }
    })
}

const activateRules = () =>
    _.forEach(rules, (_rule, tag) => tag$.next({tag, activate: true}))

const start = () => {
    const tail = new Tail(sepalServerLog)
    tail.on('error', err => {throw(err)})
    tail.on('line', line => processLine(line))
    tail.on('restart', reason => {
        switch (reason) {
            case 'PRIMEFOUND':
                log.debug('Restarting: file appeared')
                break
            case 'NEWPRIME':
                log.debug('Restarting: file changed')
                break
            case 'TRUNCATE':
                log.debug('Restarting: file truncated')
                break
            case 'CATCHUP':
                log.debug('Restarting: file replaced')
                break
            default:
                log.debug('Restarting: ' + reason)
        }
    })
    
    if (autoRearmDelayHours) {
        log.info(`Auto re-arming every ${autoRearmDelayHours}h`)
        setInterval(activateRules, autoRearmDelayHours * 3600 * 1000)
    }
    activateRules()

    tail.start()

    log.info('Started')
    notify({message: 'Log monitoring started', priority: -1})
}

export {start}
