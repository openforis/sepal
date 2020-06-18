const job = require('root/jobs/job')

const worker$ = ({initArgs: {config}}) => {
    const {EMPTY} = require('rx')
    require('root/context').setConfig(config)
    return EMPTY
}

module.exports = job({
    jobName: 'Set configuration',
    worker$
})
