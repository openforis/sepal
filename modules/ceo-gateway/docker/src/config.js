var config = {}

config.ceo = {}

config.ceo.url = process.env.CEO_URL || 'https://127.0.0.1:8080'
config.ceo.username = process.env.CEO_USERNAME || 'admin@openforis.org'
config.ceo.password = process.env.CEO_PASSWORD || 'admin'
config.ceo.institutionId = process.env.CEO_INSTITUTION_ID || '1'

module.exports = config
