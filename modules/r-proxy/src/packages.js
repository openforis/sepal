const readline = require('readline')
const https = require('https')
const {getCranTarget} = require('./filesystem')
const log = require('sepal/log').getLogger('packages')

const getAvailablePackages = () =>
    new Promise((resolve, reject) => {
        log.debug('Requesting PACKAGES file')
        try {
            const request = https.request(getCranTarget('PACKAGES', 'PACKAGES'), {
                method: 'GET'
            }, res => {
                if (res.statusCode === 200) {
                    log.debug('Loading PACKAGES file')
                    resolve(res)
                } else {
                    reject(res.statusCode)
                }
            })
            request.end()
        } catch (error) {
            reject(error)
        }
    })
    
const checkUpdates = async enqueueUpdateBinaryPackage => {
    log.info('Checking available packages')
    const res = await getAvailablePackages()
    const rl = readline.createInterface({input: res})

    let name = null
    let version = null

    rl.on('line', line => {
        if (line.startsWith('Package: ')) {
            name = line.substring(9)
        }
        if (name && line.startsWith('Version: ')) {
            version = line.substring(9)
            enqueueUpdateBinaryPackage(name, version)
            name = null
        }
    })

    rl.on('close', () => {
        log.info('Checked availables packages')
    })
}

module.exports = {checkUpdates}
