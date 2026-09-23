import PropTypes from 'prop-types'

import format from '~/format'
import {Tag} from '~/widget/tag'

// What an instance provides and costs, as one line: "4 CPU · 1 GPU · 16 GB · $1.12/h". GPUs are
// counted only where there are any: "0 GPU" on every ordinary instance would be noise.
export const instanceSpecs = ({cpuCount, gpuCount, ramGiB, hourlyCost}) =>
    [
        `${cpuCount} CPU`,
        gpuCount ? `${gpuCount} GPU` : null,
        `${ramGiB} GB`,
        format.dollarsPerHour(hourlyCost)
    ].filter(Boolean).join(' · ')

// The pill every surface shows an instance's specs in, so the session list and the instance
// picker describe the same machine the same way.
export const InstanceSpecsTag = ({instanceType}) =>
    <Tag size='small' label={instanceSpecs(instanceType)} upperCase={false}/>

InstanceSpecsTag.propTypes = {
    instanceType: PropTypes.object.isRequired
}
