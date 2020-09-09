const log = require('sepal/log').getLogger('email')
const {smtpHost, smtpPort, smtpSecure, smtpUser, smtpPassword, smtpFrom} = require('./config')
const nodemailer = require("nodemailer")
const {default: ShortUniqueId} = require('short-unique-id')
const uid = new ShortUniqueId()

const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
        user: smtpUser,
        pass: smtpPassword
    }
})

const send = async email => {
    const id = uid()
    await transport.verify()
    log.trace(`<${id}> Sending email:` ,email)
    const status = await transport.sendMail(email)
    log.debug(`<${id}> Email status:`, status)
}

module.exports = {send}
