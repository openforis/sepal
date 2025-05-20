import _ from 'lodash'
import React from 'react'

import {PalettePreSets, pickColors} from '~/app/home/map/visParams/palettePreSets'
import format from '~/format'
import {msg} from '~/translate'
import {Layout} from '~/widget/layout'

import styles from './strataTable.module.css'
import {StratumForm} from './stratumForm'

export class StrataTable extends React.Component {
    state = {invalidStrata: {}}

    constructor(props) {
        super(props)
        this.updateStratum = this.updateStratum.bind(this)
        this.applyPreset = this.applyPreset.bind(this)
    }

    render() {
        const {strata, showHexColorCode} = this.props
        return (
            <Layout>
                <div className={showHexColorCode ? styles.hexStrata : styles.strata}>
                    <Header showHexColorCode={showHexColorCode}/>
                    {strata.map(stratum =>
                        <Stratum
                            key={stratum.value}
                            stratum={stratum}
                            strata={strata}
                            showHexColorCode={showHexColorCode}
                            onSwap={color => this.swap(color, stratum.color)}
                            onChange={this.updateStratum}
                        />
                    )}
                    <Footer strata={strata}/>
                </div>
                <PalettePreSets
                    onSelect={this.applyPreset}
                    count={strata.length}
                    className={styles.palettePreSets}
                    autoFocus={false}
                />
            </Layout>
        )
    }

    updateStratum(updatedStratum, updatedStrata, invalid) {
        const {strata, onChange} = this.props
        this.setState(({invalidStrata}) => {
            const filteredInvalidStrata = _.pick(invalidStrata, strata.map(({id}) => id))
            return invalid
                ? {invalidStrata: {...filteredInvalidStrata, ...{[updatedStratum.id]: true}}}
                : {invalidStrata: _.omit(filteredInvalidStrata, [updatedStratum.id])}
        }, () => onChange(updatedStrata, this.hasInvalidStratum()))
    }

    hasInvalidStratum() {
        const {invalidStrata} = this.state
        return !!Object.keys(invalidStrata).length
    }
    
    applyPreset(colors) {
        const {strata, onChange} = this.props
        const mappedColors = pickColors(strata.length, colors)
        onChange(strata.map((stratum, i) => ({
            ...stratum, color: mappedColors[i]
        })), this.hasInvalidStratum())
    }

    swap(color1, color2) {
        const {strata, onChange} = this.props
        const stratum1 = strata.find(({color}) => color === color1)
        const stratum2 = strata.find(({color}) => color === color2)
        const updatedEntries = [
            {...stratum1, color: color2},
            {...stratum2, color: color1}
        ]

        onChange(strata.map(entry =>
            updatedEntries.find(({id}) => id === entry.id) || entry
        ), this.hasInvalidStratum())
    }
}

const Header = ({showHexColorCode}) => {
    return (
        <div className={styles.header}>
            {showHexColorCode ? <div/> : null}
            <div/>
            <div/>
            <div className={styles.number}>{msg('process.samplingDesign.panel.stratification.form.strata.table.value')}</div>
            <div className={styles.number}>{msg('process.samplingDesign.panel.stratification.form.strata.table.area')}</div>
            <div className={styles.number}>{msg('process.samplingDesign.panel.stratification.form.strata.table.weight')}</div>
        </div>
    )
}

const Footer = ({strata}) => {
    return (
        <div className={styles.footer}>
            <div className={styles.overall}>{msg('process.samplingDesign.panel.stratification.form.strata.table.total')}</div>
            <div className={styles.number}>{format.units(_.sumBy(strata, 'area') / 1e4)}</div>
            <div className={styles.number}>100%</div>
        </div>
    )
}

const Stratum = ({stratum, strata, showHexColorCode, onSwap, onChange}) =>
    <div className={styles.stratum}>
        <StratumForm
            stratum={stratum}
            strata={strata}
            showHexColorCode={showHexColorCode}
            onSwap={onSwap}
            onChange={onChange}
        />
        <div className={styles.number}>{stratum.value}</div>
        <div className={styles.number}>{format.units(stratum.area / 1e4, 3)}</div>
        <div className={styles.number}>{format.units(stratum.weight * 100)}%</div>
    </div>

