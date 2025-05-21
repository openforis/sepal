import _ from 'lodash'
import React from 'react'

import {PalettePreSets, pickColors} from '~/app/home/map/visParams/palettePreSets'
import format from '~/format'
import {msg} from '~/translate'
import {NestedForms} from '~/widget/form/nestedForms'
import {Layout} from '~/widget/layout'

import styles from './strataTable.module.css'
import {StratumForm} from './stratumForm'

export class StrataTable extends React.Component {
    constructor(props) {
        super(props)
        this.applyPreset = this.applyPreset.bind(this)
    }

    render() {
        const {strata, showHexColorCode} = this.props
        return (
            <Layout>
                <div className={showHexColorCode ? styles.hexStrata : styles.strata}>
                    <Header showHexColorCode={showHexColorCode}/>
                    <NestedForms arrayInput={strata} idPropName='value'>
                        {strata.value.map(stratum =>
                            <StratumForm
                                key={stratum.value}
                                stratum={stratum}
                                strata={strata.value}
                                showHexColorCode={showHexColorCode}
                                onSwap={color => this.swap(color, stratum.color)}
                            />
                        )}
                    </NestedForms>
                    <Footer strata={strata.value}/>
                </div>
                <PalettePreSets
                    onSelect={this.applyPreset}
                    count={strata.value.length}
                    className={styles.palettePreSets}
                    autoFocus={false}
                />
            </Layout>
        )
    }

    applyPreset(colors) {
        const {strata} = this.props
        const mappedColors = pickColors(strata.value.length, colors)
        const updatedStrata = strata.value.map((stratum, i) => ({
            ...stratum, color: mappedColors[i]
        }))
        strata.set(updatedStrata)
    }

    swap(color1, color2) {
        const {strata} = this.props
        const stratum1 = strata.value.find(({color}) => color === color1)
        const stratum2 = strata.value.find(({color}) => color === color2)
        const updatedEntries = [
            {...stratum1, color: color2},
            {...stratum2, color: color1}
        ]
        const updatedStrata = strata.value.map(entry =>
            updatedEntries.find(({id}) => id === entry.id) || entry
        )
        strata.set(updatedStrata)
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
