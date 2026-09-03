import {getLogger} from '#sepal/log'

import {
    googleProjectId, recaptchaApiKey, recaptchaMinScore, recaptchaOptional, recaptchaSiteKey, sepalHost
} from './config.js'

const log = getLogger('recaptcha')

// Calls Google reCAPTCHA Enterprise; true iff the action matches and the risk score clears the min.
const googleVerify = ({projectId, apiKey, siteKey, minScore, host}) => async (token, action) => {
    try {
        const response = await fetch(
            `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`,
            {
                method: 'POST',
                headers: {'Content-Type': 'application/json', Referer: host},
                body: JSON.stringify({event: {token, expectedAction: action, siteKey}})
            }
        )
        const data = await response.json()
        const validAction = Boolean(data?.tokenProperties?.valid && data?.tokenProperties?.action === action)
        const validScore = (data?.riskAnalysis?.score ?? 0) >= minScore
        if (validAction && !validScore) {
            log.warn('reCAPTCHA score too low', data.riskAnalysis)
        }
        return validAction && validScore
    } catch (error) {
        log.error('Could not validate reCAPTCHA', error)
        return false
    }
}

// `verify(token, action) -> Promise<boolean>` is injectable for tests. When optional, verification is
// bypassed (dev/CI without browser tokens) — a documented divergence from Java, which always calls Google.
const createRecaptcha = ({optional, verify}) => ({
    isValid: async (token, action) => optional ? true : verify(token, action)
})

const recaptcha = createRecaptcha({
    optional: recaptchaOptional,
    verify: googleVerify({
        projectId: googleProjectId,
        apiKey: recaptchaApiKey,
        siteKey: recaptchaSiteKey,
        minScore: recaptchaMinScore,
        host: sepalHost
    })
})

export {createRecaptcha, googleVerify, recaptcha}
