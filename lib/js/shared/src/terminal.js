const {spawn} = require('child_process')
const {Subject, defer} = require('rxjs')
const log = require('#sepal/log').getLogger('terminal')

const terminal$ = (command, args = [], options = {}) =>
    defer(() => {
        log.debug(msg(`${command} ${args.join(' ')}`))
        const defaultOptions = {encoding: 'utf8', shell: true}
        const mergedOptions = {...defaultOptions, ...options}
        const subject = new Subject()
        const buffer = mergedOptions.encoding === 'buffer'
        const toValue = data => buffer ? data : data.toString(mergedOptions.encoding)
        try {
            const process = spawn(command, args, mergedOptions)
            process.stdout.on('data', data => {
                subject.next({stream: 'stdout', value: toValue(data)})
            })
            process.stderr.on('data', data => {
                subject.next({stream: 'stderr', value: toValue(data)})
            })
            process.on('error', error => {
                subject.error(error)
            })
            process.on('close', exitCode => {
                subject.next({exitCode})
                if (exitCode) {
                    log.error(msg(`Failed with exit code ${exitCode}: ${command} ${args.join(' ')}`))
                    subject.error(new Error(command))
                } else {
                    subject.complete()
                }
            })
        } catch (error) {
            log.error(msg(`Failed to spawn process <${command} ${args && args.join(' ')}>`))
            subject.error(error)
        }
        return subject
    })

const msg = message => `Terminal: ${message}`

module.exports = {terminal$}
