const yearlyTimeScanSchema = {
    type: 'object',
    description: 'Date configuration for yearly time scan',
    properties: {
        type: {type: 'string', enum: ['YEARLY_TIME_SCAN']},
        targetDate: {type: 'string', format: 'date', description: 'Target date (YYYY-MM-DD)'},
        seasonStart: {type: 'string', format: 'date', description: 'Season start date'},
        seasonEnd: {type: 'string', format: 'date', description: 'Season end date'},
        yearsBefore: {type: 'integer', minimum: 0, description: 'Number of years before target to include'},
        yearsAfter: {type: 'integer', minimum: 0, description: 'Number of years after target to include'}
    },
    required: ['type', 'targetDate']
}

const dateRangeSchema = {
    type: 'object',
    description: 'Simple start/end date range',
    properties: {
        startDate: {type: 'string', format: 'date', description: 'Start date (YYYY-MM-DD)'},
        endDate: {type: 'string', format: 'date', description: 'End date (YYYY-MM-DD)'}
    },
    required: ['startDate', 'endDate']
}

module.exports = {yearlyTimeScanSchema, dateRangeSchema}
