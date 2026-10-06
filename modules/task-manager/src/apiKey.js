import {createHash, randomBytes} from 'crypto'

const PREFIX = 'task_'

export const generateApiKey = () =>
    `${PREFIX}${randomBytes(32).toString('base64url')}`

export const hashApiKey = apiKey =>
    createHash('sha256').update(apiKey).digest('hex')

export const isTaskApiKey = apiKey =>
    typeof apiKey === 'string' && apiKey.startsWith(PREFIX)
