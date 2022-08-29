// const log = require('sepal/log').getLogger('userRepository')
const _ = require('lodash')
const moment = require('moment')
const {Sql} = require('../sql')
const {Clock} = require('../clock')

const clock = Clock()

const sql = Sql({
    connectionLimit: 10,
    host: 'example.org',
    user: 'bob',
    password: 'secret',
    database: 'my_db'
})

const STATUS = {
    PENDING: 'PENDING',
    LOCKED: 'LOCKED',
    ACTIVE: 'ACTIVE'
}

const ROLES = {
    ADMIN: 'ADMIN'
}

const userFields = {
    id: true,
    username: true,
    name: true,
    email: true,
    organization: true,
    email_notifications_enabled: 'emailNotificationsEnabled',
    admin: true,
    system_user: 'systemUser',
    status: true,
    google_refresh_token: 'googleRefreshToken',
    google_access_token: 'googleAccessToken',
    google_access_token_expiration: 'googleAccessTokenExpiration',
    creation_time: 'creationTime',
    update_time: 'updateTime'
}

const createUser = ({
    id,
    username,
    name,
    email,
    organization,
    emailNotificationsEnabled,
    admin,
    systemUser,
    status,
    googleRefreshToken,
    googleAccessToken,
    googleAccessTokenExpiration,
    creationTime,
    updateTime
}) => ({
    id,
    name,
    username,
    email,
    organization,
    emailNotificationsEnabled,
    roles: admin ? [ROLES.ADMIN] : [],
    systemUser,
    status,
    googleTokens: googleRefreshToken ? {
        refreshToken: googleRefreshToken,
        accessToken: googleAccessToken,
        accessTokenExpiryDate: googleAccessTokenExpiration.time
    } : null,
    creationTime: moment(creationTime),
    updateTime: moment(updateTime)
})

const UserRepository = () => {
    const userByUsername = async username => {
        const [user] = await sql.select({
            table: 'sepal_user',
            fields: {
                id: true,
                name: true,
                username: true,
                email: true,
                organization: true,
                email_notifications_enabled: 'emailNotificationsEnabled',
                status: true,
                roles: true,
                creation_time: 'creationTime',
                update_time: 'updateTime'
            },
            // where: `username = '${sql.escape(username)}'`,
            where: {
                username
            },
            limit: 1
        })
        return user
    }

    const insertUser = async (user, token) => {
        const {username, name, email, organization, emailNotificationsEnabled, admin, systemUser, creationTime, updateTime} = user
        await sql.insert({
            table: 'sepal_user',
            fields: {
                username,
                name,
                email,
                organization,
                email_notifications_enabled: emailNotificationsEnabled,
                token,
                admin,
                system_user: systemUser,
                status: STATUS.PENDING,
                creation_time: creationTime,
                update_time: updateTime
            }
        })
        return await userByUsername(username)
    }

    const updateUserDetails = async user => {
        const {name, email, organization, emailNotificationsEnabled, admin, updateTime, username} = user
        await sql.update({
            table: 'sepal_user',
            fields: {
                name,
                email,
                organization,
                email_notifications_enabled: emailNotificationsEnabled,
                admin,
                update_time: updateTime
            },
            where: {
                username
            }
        })
        return await userByUsername(username)
    }

    const deleteUser = async username => {
        await sql.remove({
            table: 'sepal_user',
            where: {
                username
            }
        })
    }

    const listUsers = async () => {
        const results = await sql.select({
            table: 'sepal_user',
            fields: userFields,
            order: {
                creation_time: 'DESC'
            }
        })
        return results.map(user => createUser(user))
    }

    const sqlLastLoginTime = async (username, loginTime) =>
        await sql.update({
            table: 'sepal_user',
            fields: {
                last_login_time: loginTime
            },
            where: {
                username
            }
        })

    const lookupUser = async username =>
        createUser(
            await sql.selectOne({
                table: 'sepal_user',
                fields: userFields,
                where: {
                    username
                }
            })
        )

    const findUserByEmail = async email =>
        createUser(
            await sql.selectOne({
                table: 'sepal_user',
                fields: userFields,
                where: {
                    email
                }
            })
        )

    const emailNotificationsEnabled = async email => {
        const [result] = await sql.selectOne({
            table: 'sepal_user',
            fields: {
                email_notifications_enabled: emailNotificationsEnabled
            },
            where: {
                email
            }
        })
        return result?.emailNotificationsEnabled
    }
    
    const updateToken = async (username, token, tokenGenerationTime) =>
        await sql.update({
            table: 'sepal_user',
            fields: {
                token,
                token_generation_time: tokenGenerationTime,
                update_time: clock.now()
            },
            where: {
                username
            }
        })

    const tokenStatus = async token => {
        const [result] = await sql.selectOne({
            table: 'sepal_user',
            fields: userFields,
            where: {
                token
            }
        })
        return result
            ? {
                generationTime: result.generationTime,
                user: createUser(result)
            } : null
    }

    const invalidateToken = async token =>
        await sql.update({
            table: 'sepal_user',
            fields: {
                token: null
            },
            where: {
                token
            }
        })

    const updateStatus = async (username, status) =>
        await sql.update({
            table: 'sepal_user',
            fields: {
                status
            },
            where: {
                username
            }
        })

    const updateGoogleTokens = async (username, {refreshToken, accessToken, accessTokenExpiryDate}) =>
        await sql.update({
            table: 'sepal_user',
            fields: {
                google_refresh_token: refreshToken,
                google_access_token: accessToken,
                google_access_token_expiration: new Date(accessTokenExpiryDate),
                update_time: clock.now()
            },
            where: {
                username
            }
        })

    return {
        insertUser,
        updateUserDetails,
        deleteUser,
        listUsers,
        sqlLastLoginTime,
        lookupUser,
        findUserByEmail,
        emailNotificationsEnabled,
        updateToken,
        tokenStatus,
        invalidateToken,
        updateStatus,
        updateGoogleTokens
    }
}

module.exports = {
    UserRepository
}
