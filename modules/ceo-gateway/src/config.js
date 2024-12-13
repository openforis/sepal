var config = {}

config.ceo = {}

config.ceo.url = 'https://app.collect.earth/'
config.ceo.username = process.env.CEO_USERNAME || 'admin@openforis.org'
config.ceo.password = process.env.CEO_PASSWORD || ''
config.ceo.institutionId = process.env.CEO_INSTITUTION_ID || '1'

module.exports = config
