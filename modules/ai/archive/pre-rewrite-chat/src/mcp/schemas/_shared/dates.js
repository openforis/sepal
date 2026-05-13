const yearlyTimeScanSchema = {
    type: 'object',
    description: 'Date configuration for yearly time scan',
    properties: {
        type: {type: 'string', enum: ['YEARLY_TIME_SCAN']},
        targetDate: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            description: 'Target date (YYYY-MM-DD). Must be between 1982-08-22 and today.'
        },
        seasonStart: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            description: 'Season start date (YYYY-MM-DD). Must be within one year before targetDate.'
        },
        seasonEnd: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            description: 'Season end date (YYYY-MM-DD). Must be after targetDate and within one year after it.'
        },
        yearsBefore: {
            type: 'integer', minimum: 0, maximum: 25,
            description: 'Number of years before target to include (default: 0)'
        },
        yearsAfter: {
            type: 'integer', minimum: 0, maximum: 25,
            description: 'Number of years after target to include (default: 0)'
        }
    },
    required: ['type', 'targetDate']
}

const dateRangeSchema = {
    type: 'object',
    description: 'Simple start/end date range',
    properties: {
        startDate: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            description: 'Start date (YYYY-MM-DD)'
        },
        endDate: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            description: 'End date (YYYY-MM-DD)'
        }
    },
    required: ['startDate', 'endDate']
}

module.exports = {yearlyTimeScanSchema, dateRangeSchema}
