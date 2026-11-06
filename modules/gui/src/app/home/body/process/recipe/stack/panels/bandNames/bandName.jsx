import PropTypes from 'prop-types'

import {Input} from '~/widget/input'

// A band's name as the user gives it. Left empty, the band is named automatically, as the placeholder shows.
export const BandName = ({className, originalName, value, placeholder, error, warning, onChange}) =>
    <Input
        className={className}
        label={originalName}
        value={value}
        placeholder={placeholder}
        errorMessage={error}
        warningMessage={warning}
        autoComplete={false}
        onChange={e => onChange(e.target.value)}
    />

BandName.propTypes = {
    originalName: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    className: PropTypes.string,
    error: PropTypes.string,
    placeholder: PropTypes.string,
    warning: PropTypes.string
}
