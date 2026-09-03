import {getLogger} from '#sepal/log'

const log = getLogger('worker/budgetUserClient')

const ADMIN_ROLE = 'application_admin'
const DEFAULT_USER_URL = 'http://user/'

const createUserClient = config => {
    const baseUrl = config.userUrl || DEFAULT_USER_URL
    const adminUsername = config.sepalUser || 'sepalAdmin'

    // Impersonate an admin — matches the 4c GoogleOAuthGateway's sepal-user header.
    const sepalUser = JSON.stringify({username: adminUsername, roles: [ADMIN_ROLE]})

    const listUsernames = async () => {
        const url = `${baseUrl}list`
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'sepal-user': sepalUser,
            },
        })
        if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`Failed to list users from ${url}: ${response.status} ${text}`)
        }
        const users = await response.json()
        return (Array.isArray(users) ? users : [])
            .map(user => user?.username)
            .filter(username => username != null)
    }

    const eachUsername = async fn => {
        const usernames = await listUsernames()
        log.debug(() => `eachUsername iterating ${usernames.length} users`)
        for (const username of usernames) {
            await fn(username)
        }
    }

    return {eachUsername}
}

export {createUserClient}
