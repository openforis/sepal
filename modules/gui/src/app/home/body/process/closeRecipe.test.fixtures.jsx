import {setInitialized} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {withActivators} from '~/widget/activation/activator'
import {Form} from '~/widget/form'
import {Panel} from '~/widget/panel/panel'
import {PanelWizard} from '~/widget/panelWizard'
import {PortalContainer, PortalContext} from '~/widget/portal'

// Stand-ins for a recipe being set up by its wizard and one already set up, for closeRecipe.test.jsx: one step, or one
// panel opened from a button, each a required name in a recipe form panel as every recipe's panels are.

const fields = {name: new Form.Field().notBlank()}

const namePanel = id => compose(
    ({inputs: {name}}) =>
        <RecipeFormPanel placement='bottom-right'>
            <Panel.Header title={id}/>
            <Panel.Content>
                <Form.Input label={`${id}.name`} input={name}/>
            </Panel.Content>
            <Form.PanelButtons/>
        </RecipeFormPanel>,
    recipeFormPanel({id, fields})
)

const Step = namePanel('step')

const Settings = namePanel('settings')

const OpenSettings = withActivators('settings')(({activator: {activatables: {settings}}}) =>
    <button onClick={() => settings.activate()}>open settings</button>
)

export const WizardRecipe = compose(
    ({recipeId, initialized}) =>
        <>
            <PortalContainer id={`panels-${recipeId}`}/>
            <PortalContext id={`panels-${recipeId}`}>
                <PanelWizard panels={['step']} initialized={initialized} onDone={() => setInitialized(recipeId)}>
                    <Step/>
                </PanelWizard>
            </PortalContext>
        </>,
    withRecipe(recipe => ({initialized: recipe.ui?.initialized}))
)

export const SetUpRecipe = ({recipeId}) =>
    <>
        <PortalContainer id={`panels-${recipeId}`}/>
        <PortalContext id={`panels-${recipeId}`}>
            <PanelWizard panels={['settings']} initialized>
                <OpenSettings/>
                <Settings/>
            </PanelWizard>
        </PortalContext>
    </>
