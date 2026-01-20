const {getEmailNotificationsEnabled: getEmailNotificationsEnabledCache, setEmailNotificationsEnabled: setEmailNotificationsEnabledCache} = require('./cache')
const {getEmailNotificationsEnabled: getEmailNotificationsEnabledRemote} = require('./http')

const getEmailNotificationsEnabled = async emailAddress => {
    const emailNotificationsEnabledCache = await getEmailNotificationsEnabledCache(emailAddress)
    if (emailNotificationsEnabledCache !== undefined) {
        return emailNotificationsEnabledCache
    } else {
        const emailNotificationsEnabledRemote = await getEmailNotificationsEnabledRemote(emailAddress)
        setEmailNotificationsEnabledCache(emailAddress, emailNotificationsEnabledRemote)
        return emailNotificationsEnabledRemote
    }
}

const filterEmailNotificationsEnabled = async (emailAddressOrAddresses, forceEmailNotificationEnabled) => {
    if (!emailAddressOrAddresses) {
        return []
    }
    const emailAddresses = Array.isArray(emailAddressOrAddresses) ? emailAddressOrAddresses : [emailAddressOrAddresses]

    const emailAddressesEnabled = await Promise.all(
        emailAddresses.map(async emailAddress => ({
            emailAddress,
            enabled: forceEmailNotificationEnabled || await getEmailNotificationsEnabled(emailAddress)
        }))
    )

    return emailAddressesEnabled.filter(({enabled}) => enabled).map(({emailAddress}) => emailAddress)
}

module.exports = {getEmailNotificationsEnabled, filterEmailNotificationsEnabled}
