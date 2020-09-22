const log = require('sepal/log').getLogger('email')
const {smtpHost, smtpPort, smtpSecure, smtpUser, smtpPassword, smtpFrom} = require('./config')
const fs = require('fs')
const nodemailer = require('nodemailer')
const Handlebars = require('handlebars')
const marked = require('marked')

const EMAIL_TEMPLATE = fs.readFileSync(`${__dirname}/template.hbs`, {encoding: 'utf-8'})

const template = Handlebars.compile(EMAIL_TEMPLATE)

const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
        user: smtpUser,
        pass: smtpPassword
    }
})

const tag = ({from, to, cc, bcc, subject}) =>
    [
        from ? `from: <${from}>` : null,
        to ? `to: <${to}>` : null,
        cc ? `cc: <${cc}>` : null,
        bcc ? `bcc: <${bcc}>` : null,
        `subject: "${subject}"`
    ].filter(attr => attr).join(', ')

const send = async ({id, email: {to, cc, bcc, subject = '', body = ''}}) => {
    await transport.verify()
    const context = {
        subject,
        body: marked(body)
    }
    const html = template(context)
    const from = smtpFrom
    const email = {from, to, cc, bcc, subject, html}
    log.isTrace()
        ? log.trace(`<${id}> Sending email ${tag({from, to, cc, bcc, subject})}\n`, body)
        : log.debug(`<${id}> Sending email ${tag({from, to, cc, bcc, subject})}`)
    const status = await transport.sendMail(email)
    log.debug(`<${id}> Email status:`, status)
}

module.exports = {send, tag}
