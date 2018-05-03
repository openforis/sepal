import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import Icon from 'widget/icon'
import styles from './aoi.module.css'
import {map} from '../../../../../map/map'

const CountrySection = ({form, inputs: {section, country}}) =>
    <div>
        <div className={styles.header}>
            <a className={styles.icon} onClick={() => section.set('')} onMouseDown={(e) => e.preventDefault()}>
                <Icon name='arrow-left'/>
            </a>
            <span className={styles.title}><Msg id='process.mosaic.panel.areaOfInterest.form.country.title'/></span>
        </div>
        <div className={styles.body}>
            <label><Msg id='process.mosaic.panel.areaOfInterest.form.country.label'/></label>
            <Input
                input={country}
                placeholder={msg('process.mosaic.panel.areaOfInterest.form.country.placeholder')}
                autoFocus='on'
                autoComplete='off'
                tabIndex={1}/>
            <ErrorMessage input={country}/>
        </div>
    </div>

export default CountrySection