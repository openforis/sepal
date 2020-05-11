const {spawn} = require('child_process')
const {Subject} = require('rxjs')
const log = require('sepal/log').getLogger('terminal')

const terminal$ = (command, args = [], options) => {
    var subject = new Subject()
    const buffer = !options || !options.encoding || options.encoding === 'buffer'
    console.log('****** buffer', buffer)
    const toValue = data => buffer ? data : data.toString(options.encoding)
    try {
        const process = spawn(command, args, options)
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
            subject.complete()
        })
    } catch (error) {
        log.error(`Failed to spawn process <${command} ${args && args.split(' ')}>`)
        subject.error(error)
    }
    return subject
}

module.exports = {terminal$}
