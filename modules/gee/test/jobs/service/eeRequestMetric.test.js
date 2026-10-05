import {createRequire} from 'module'

import {recordEERequest} from '#gee/jobs/service/eeRequestMetric'

// prom-client is a dependency of the shared library, whose default registry /metrics serves.
const require = createRequire(import.meta.url)
const {register} = createRequire(require.resolve('sepal/package.json'))('prom-client')

test('an Earth Engine request is counted in the registry /metrics serves', async () => {
    const before = await count({auth: 'user', status: '429'})

    recordEERequest({auth: 'user', status: '429'})

    expect(await count({auth: 'user', status: '429'})).toBe(before + 1)
})

const count = async labels => {
    const metric = await register.getSingleMetric('sepal_ee_requests_total').get()
    return metric.values.find(({labels: {auth, status}}) => auth === labels.auth && status === labels.status)?.value ?? 0
}
