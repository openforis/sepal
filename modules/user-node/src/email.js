import {Subject} from 'rxjs'

import {sepalHost} from './config.js'
import {invitationContent, passwordResetContent} from './emailTemplates.js'

const FROM = 'user-node'

// Emissions are published to the `email.sendToAddress` topic (wired in main.js); the email module
// renders/sends them. We send to the user's email directly (matches the Java SMTP gateway).
const email$ = new Subject()

// These are all mandatory transactional emails (invite, password reset). They must be delivered
// regardless of the recipient's email-notification preference, so force delivery (the email module
// otherwise filters `email.sendToAddress` recipients by that preference and silently drops them).
const send = (to, subject, content) =>
    email$.next({from: FROM, to, subject, content, contentType: 'text/html', forceEmailNotificationEnabled: true})

const activationLink = token => `https://${sepalHost}/setup-account?token=${token}`
const resetLink = token => `https://${sepalHost}/reset-password?token=${token}`

const sendInvite = (user, token) =>
    send(user.email, 'Sepal Account', invitationContent(user, activationLink(token)))

const sendPasswordReset = (user, token) =>
    send(user.email, 'Sepal Password Reset', passwordResetContent(user, resetLink(token)))

export {email$, sendInvite, sendPasswordReset}
