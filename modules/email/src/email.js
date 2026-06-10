import fs from 'fs'
import Handlebars from 'handlebars'
import {marked} from 'marked'
import nodemailer from 'nodemailer'

import {getLogger} from '#sepal/log'

import {smtpFromDomain, smtpHost, smtpPassword, smtpPort, smtpSecure, smtpUser} from './config.js'

const log = getLogger('email')

const EMAIL_TEMPLATE = fs.readFileSync(new URL('./template.hbs', import.meta.url), {encoding: 'utf-8'})

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

const getBody = (content, contentType) => {
    switch (contentType) {
        case 'text/plain':
            return content
        case 'text/markdown':
            return marked(content)
        case 'text/html':
            return new Handlebars.SafeString(content)
        default:
            throw new Error(`Unknown content-type: ${contentType}`)
    }
}

const getFrom = from => {
    if (from) {
        if (from.includes('@')) {
            return from
        }
        return `${from}@${smtpFromDomain}`
    }
    return `no-reply@${smtpFromDomain}`
}

const send = async ({id, email: {from: tentativeFrom, to, cc, bcc, subject = '', content = '', contentType = 'text/plain'}}) => {
    await transport.verify()
    const from = getFrom(tentativeFrom)
    try {
        const body = getBody(content, contentType)
        const html = body.trim().length > 0
            ? template({subject, body})
            : ''
        const email = {from, to, cc, bcc, subject, html}
        log.isTrace()
            ? log.trace(`<${id}> Sending email ${tag({from, to, cc, bcc, subject})}\n`, body)
            : log.debug(`<${id}> Sending email ${tag({from, to, cc, bcc, subject})}`)
        const status = await transport.sendMail(email)
        log.debug(() => [`<${id}> Email status:`, status])
    } catch (error) {
        log.warn(`<${id}> Ignoring email ${tag({from, to, cc, bcc, subject})}`, error)
    }
}

export {send, tag}
