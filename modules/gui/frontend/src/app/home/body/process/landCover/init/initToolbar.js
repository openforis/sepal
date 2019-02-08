import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import {coordinateActivation, withActivationStatus} from 'widget/activation'
import {Button} from 'widget/button'
import {Panel, PanelContent} from 'widget/panel'
import styles from './typology.module.css'

const recipeToProps = recipe => {
    const model = recipe.model
    return {
        initialized: model.aoi && model.period && model.typology
    }
}

const TypologyPanel = () =>
    <Panel type='top-right' className={styles.panel}>
        <PanelContent>Typology</PanelContent>
    </Panel>

const typologyPolicy = () => ({
    othersCanActivate: {
        // include: ['period']
        // exclude: ['period']
    },
    deactivateWhenActivated: {
        // include: ['period']
        exclude: ['period']
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
        exclude: ['typology']
    }
})

const ManagedTypologyPanel = coordinateActivation('typology', typologyPolicy)(TypologyPanel)

const PeriodPanel = () =>
    <Panel type='bottom-right' className={styles.panel}>
        <PanelContent>Period</PanelContent>
    </Panel>

const ManagedPeriodPanel = coordinateActivation('period', periodPolicy)(PeriodPanel)

const TypologyButton = ({activate, deactivate, active, canActivate}) =>
    <Button
        label='Typology'
        disabled={!canActivate}
        look={active ? 'cancel' : 'add'}
        onClick={() => active ? deactivate() : activate()}
    />

const ManagedTypologyButton = withActivationStatus('typology')(TypologyButton)

const PeriodButton = ({activate, deactivate, active, canActivate}) =>
    <Button
        label='Period'
        disabled={!canActivate}
        look={active ? 'cancel' : 'add'}
        onClick={() => active ? deactivate() : activate()}
    />
const ManagedPeriodButton = withActivationStatus('period')(PeriodButton)

class InitToolbar extends React.Component {
    render() {
        // const {initialized, recipeContext: {recipeId, statePath}} = this.props
        // const uiStatePath = statePath + '.ui'
        return (
            <div style={{pointerEvents: 'all'}}>
                <ManagedTypologyButton/>
                <ManagedPeriodButton/>


                <ManagedTypologyPanel/>
                <ManagedPeriodPanel/>
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
