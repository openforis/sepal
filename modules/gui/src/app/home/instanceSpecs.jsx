import PropTypes from 'prop-types'

import format from '~/format'
import {Tag} from '~/widget/tag'

// What an instance provides and costs, as one line: "4 CPU · 1 GPU · 16 GB · 250 GB SSD · 3.0× ·
// $1.12/h". GPUs and SSD are listed only where there are any: "0 GPU" on every ordinary instance
// would be noise. Performance is CPU throughput relative to the t1 instance type. SSD and
// performance help choose an instance, so `compact` leaves them out once it is chosen.
export const instanceSpecs = ({cpuCount, gpuCount, ramGiB, ssdGB, performance, hourlyCost}, {compact = false} = {}) =>
    [
        `${cpuCount} CPU`,
        gpuCount ? `${gpuCount} GPU` : null,
        `${ramGiB} GB`,
        !compact && ssdGB ? `${ssdGB} GB SSD` : null,
        !compact && performance ? `${performance.toFixed(1)}×` : null,
        format.dollarsPerHour(hourlyCost)
    ].filter(Boolean).join(' · ')

// The pill every surface shows an instance's specs in, so the session list and the instance
// picker describe the same machine the same way.
export const InstanceSpecsTag = ({instanceType, compact}) =>
    <Tag shape='none' size='small' label={instanceSpecs(instanceType, {compact})} upperCase={false}/>

InstanceSpecsTag.propTypes = {
    instanceType: PropTypes.object.isRequired,
    compact: PropTypes.bool
}
