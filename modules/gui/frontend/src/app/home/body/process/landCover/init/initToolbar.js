import {Button, ButtonGroup} from 'widget/button'
import {Panel, PanelContent} from 'widget/panel'
import {coordinateActivation, withActivationStatus} from 'widget/activation'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './typology.module.css'

const recipeToProps = recipe => {
    const model = recipe.model
    return {
        initialized: model.aoi && model.period && model.typology
    }
}

const alphaPolicy = () => ({
    othersCanActivate: {
        // include: ['beta'],
        exclude: ['gamma']
    },
    deactivateWhenActivated: {
        // include: ['beta']
        // exclude: ['beta']
    }
})

const betaPolicy = () => ({
    othersCanActivate: {
        // include: ['alpha']
        // exclude: ['alpha']
    },
    deactivateWhenActivated: {
        // include: ['beta']
        // exclude: ['beta']
    }
})

const gammaPolicy = () => ({
    othersCanActivate: {
        // include: ['alpha']
        // exclude: ['alpha']
    },
    deactivateWhenActivated: {
        // include: ['beta']
        // exclude: ['beta']
    }
})

const typologyPolicy = () => ({
    othersCanActivate: {
        // include: ['period']
        // exclude: ['period']
    },
    deactivateWhenActivated: {
        // include: ['period']
        // exclude: ['period']
    }
})

const periodPolicy = () => ({
    // active: true, // TODO: Should open panel on mount
    othersCanActivate: {
        // include: ['typology'],
        // exclude: ['typology']
    },
    deactivateWhenActivated: {
        // include: ['typology']
        // exclude: ['typology']
    }
})

const AlphaPanel = () =>
    <Panel type='top-right' className={styles.panel}>
        <PanelContent>Alpha panel</PanelContent>
    </Panel>

const BetaPanel = () =>
    <Panel type='bottom-right' className={styles.panel}>
        <PanelContent>Beta panel</PanelContent>
    </Panel>

const GammaPanel = () =>
    <Panel type='bottom' className={styles.panel}>
        <PanelContent>Gamma panel</PanelContent>
    </Panel>

const TypologyPanel = () =>
    <Panel type='bottom' className={styles.panel}>
        <PanelContent>Typology</PanelContent>
    </Panel>

const PeriodPanel = () =>
    <Panel type='right' className={styles.panel}>
        <PanelContent>Period</PanelContent>
    </Panel>

const ManagedAlphaPanel = coordinateActivation('alpha', alphaPolicy)(AlphaPanel)
const ManagedBetaPanel = coordinateActivation('beta', betaPolicy)(BetaPanel)
const ManagedGammaPanel = coordinateActivation('gamma', gammaPolicy)(GammaPanel)
const ManagedTypologyPanel = coordinateActivation('typology', typologyPolicy)(TypologyPanel)
const ManagedPeriodPanel = coordinateActivation('period', periodPolicy)(PeriodPanel)

const AlphaButton = ({activate, deactivate, active, canActivate}) =>
    <Button
        label='Alpha button'
        disabled={!active && !canActivate}
        look={active ? 'cancel' : 'add'}
        onClick={() => active ? deactivate() : activate()}
    />

const BetaButton = ({activate, deactivate, active, canActivate}) =>
    <Button
        label='Beta button'
        disabled={!active && !canActivate}
        look={active ? 'cancel' : 'add'}
        onClick={() => active ? deactivate() : activate()}
    />

const GammaButton = ({activate, deactivate, active, canActivate}) =>
    <Button
        label='Gamma button'
        disabled={!active && !canActivate}
        look={active ? 'cancel' : 'add'}
        onClick={() => active ? deactivate() : activate()}
    />

const TypologyButton = ({activate, deactivate, active, canActivate}) =>
    <Button
        label='Typology'
        disabled={!active && !canActivate}
        look={active ? 'cancel' : 'add'}
        onClick={() => active ? deactivate() : activate()}
    />

const PeriodButton = ({activate, deactivate, active, canActivate}) =>
    <Button
        label='Period'
        disabled={!active && !canActivate}
        look={active ? 'cancel' : 'add'}
        onClick={() => active ? deactivate() : activate()}
    />

const ManagedAlphaButton = withActivationStatus('alpha')(AlphaButton)
const ManagedBetaButton = withActivationStatus('beta')(BetaButton)
const ManagedGammaButton = withActivationStatus('gamma')(GammaButton)
const ManagedTypologyButton = withActivationStatus('typology')(TypologyButton)
const ManagedPeriodButton = withActivationStatus('period')(PeriodButton)

class InitToolbar extends React.Component {
    render() {
        // const {initialized, recipeContext: {recipeId, statePath}} = this.props
        // const uiStatePath = statePath + '.ui'
        return (
            <div style={{pointerEvents: 'all'}}>
                <ButtonGroup>
                    <ManagedAlphaButton/>
                    <ManagedBetaButton/>
                    <ManagedGammaButton/>
                    {/* <ManagedTypologyButton/> */}
                    {/* <ManagedPeriodButton/> */}
                </ButtonGroup>

                <ManagedAlphaPanel/>
                <ManagedBetaPanel/>
                <ManagedGammaPanel/>
                {/* <ManagedTypologyPanel/> */}
                {/* <ManagedPeriodPanel/> */}
            </div>
        )

        // return (
        //     <PanelWizard
        //         initialized={initialized}
        //         panels={['areaOfInterest', 'period', 'typology']}
        //         statePath={uiStatePath}>
        //         <Toolbar
        //             statePath={uiStatePath}
        //             vertical
        //             placement='bottom-right'
        //             className={styles.bottom}>
        //             <PanelButton
        //                 name='areaOfInterest'
        //                 label={msg('process.mosaic.panel.areaOfInterest.button')}
        //                 tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}>
        //                 <Aoi recipeId={recipeId}/>
        //             </PanelButton>
        //             <PanelButton
        //                 name='period'
        //                 label={msg('process.landCover.panel.period.button')}
        //                 tooltip={msg('process.landCover.panel.period.tooltip')}>
        //                 <Period recipeId={recipeId}/>
        //             </PanelButton>
        //             <PanelButton
        //                 name='typology'
        //                 label={msg('process.landCover.panel.typology.button')}
        //                 tooltip={msg('process.landCover.panel.typology.tooltip')}>
        //                 <Typology recipeId={recipeId}/>
        //             </PanelButton>
        //         </Toolbar>
        //     </PanelWizard>
        // )
    }
}

InitToolbar.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default InitToolbar
// export default withRecipe(recipeToProps)(
//     InitToolbar
// )
//
// export default withRecipePath()(
//     InitToolbar
// )
