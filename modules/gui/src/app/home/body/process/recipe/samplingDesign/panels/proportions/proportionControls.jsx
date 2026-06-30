import _ from 'lodash'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {Form} from '~/widget/form'
import {FormCombo} from '~/widget/form/combo'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {RecipeInput} from '~/widget/recipeInput'
import {Widget} from '~/widget/widget'

import {categoricalLegendEntries} from '../../sampling/categoricalLegend'
import styles from './proportions.module.css'
import {ProportionTable} from './proportionTable'

export const ProportionsHeaderButtons = ({skip, manual, onManualToggled, onSkipToggled}) =>
    <ButtonGroup>
        <Form.Buttons
            input={manual}
            disabled={skip.value?.length}
            options={[
                {
                    value: true,
                    icon: 'rectangle-list',
                    label: msg('process.samplingDesign.panel.proportions.form.manual.label'),
                    tooltip: msg('process.samplingDesign.panel.proportions.form.manual.tooltip')
                },
            ]}
            multiple
            onChange={manual => onManualToggled(!!manual?.length)}
        />
        <Form.Buttons
            input={skip}
            options={[
                {
                    value: true,
                    icon: 'ban',
                    label: msg('process.samplingDesign.panel.proportions.form.skip.label'),
                    tooltip: msg('process.samplingDesign.panel.proportions.form.skip.tooltip')
                },
            ]}
            multiple
            onChange={onSkipToggled}
        />
    </ButtonGroup>

export const AnticipationStrategy = ({anticipationStrategy, onChange}) =>
    <Form.Buttons
        label={msg('process.samplingDesign.panel.proportions.form.anticipationStrategy.label')}
        input={anticipationStrategy}
        options={[
            {
                value: 'PROBABILITY',
                label: msg('process.samplingDesign.panel.proportions.form.anticipationStrategy.PROBABILITY.label'),
                tooltip: msg('process.samplingDesign.panel.proportions.form.anticipationStrategy.PROBABILITY.tooltip')
            },
            {
                value: 'CATEGORICAL',
                label: msg('process.samplingDesign.panel.proportions.form.anticipationStrategy.CATEGORICAL.label'),
                tooltip: msg('process.samplingDesign.panel.proportions.form.anticipationStrategy.CATEGORICAL.tooltip')
            },
        ]}
        onChange={onChange}
    />

export const ImageSelection = ({
    inputs: {type, assetId, recipeId, band, targetClass, percentage, probabilityPerStratum, anticipationStrategy, scale},
    bands,
    visualizations,
    distinctClassOptions,
    loadingClassValues,
    canLoadClassValues,
    onLoadClassValues,
    onTypeChanged,
    onImageChanged,
    onImageLoading,
    onAssetLoaded,
    onRecipeLoaded,
    onBandChanged,
    onPercentageChanged
}) => {
    const typeButtons = <SourceTypeButtons type={type} onChange={onTypeChanged}/>
    return (
        <>
            {type.value === 'ASSET'
                ? <AssetSource
                    assetId={assetId}
                    typeButtons={typeButtons}
                    onImageChanged={onImageChanged}
                    onImageLoading={onImageLoading}
                    onAssetLoaded={onAssetLoaded}
                />
                : null}
            {type.value === 'RECIPE'
                ? <RecipeSource
                    recipeId={recipeId}
                    typeButtons={typeButtons}
                    onImageChanged={onImageChanged}
                    onImageLoading={onImageLoading}
                    onRecipeLoaded={onRecipeLoaded}
                />
                : null}
            <Layout type='horizontal'>
                <BandInput
                    band={band}
                    percentage={percentage}
                    probabilityPerStratum={probabilityPerStratum}
                    anticipationStrategy={anticipationStrategy}
                    bands={bands}
                    onBandChanged={onBandChanged}
                    onPercentageChanged={onPercentageChanged}
                />
                <ScaleInput scale={scale}/>
            </Layout>
            {anticipationStrategy.value === 'CATEGORICAL'
                ? <TargetClassInput
                    band={band}
                    targetClass={targetClass}
                    visualizations={visualizations}
                    distinctClassOptions={distinctClassOptions}
                    loading={loadingClassValues}
                    canLoad={canLoadClassValues}
                    onLoad={onLoadClassValues}
                />
                : null}
        </>
    )
}

export const OverallProportionInput = ({anticipatedOverallProportion, onChange}) =>
    <Form.Input
        className={styles.overallProportion}
        label={msg('process.samplingDesign.panel.proportions.form.overallProportion.label')}
        placeholder={msg('process.samplingDesign.panel.proportions.form.overallProportion.placeholder')}
        tooltip={msg('process.samplingDesign.panel.proportions.form.overallProportion.tooltip')}
        input={anticipatedOverallProportion}
        type='number'
        suffix={msg('process.samplingDesign.panel.proportions.form.overallProportion.suffix')}
        onChange={onChange}
    />

export const StrataProportion = ({eeStrategy, anticipatedProportions, manual, streamActive}) => {
    const overallProportion = _.sum(
        anticipatedProportions.value?.map(({weight, proportion}) => {
            return weight * proportion
        })
    )
    return (
        <Widget
            label={msg('process.samplingDesign.panel.proportions.form.strataProportion.label')}
            labelButtons={manual ? [] : [<EEStrategyButtons key='eeStrategy' eeStrategy={eeStrategy}/>]}>
            {anticipatedProportions.value
                ? <ProportionTable
                    proportions={anticipatedProportions}
                    overallProportion={overallProportion}
                    manual={manual}
                />
                : streamActive
                    ? <NoData
                        alignment='left'
                        message={(
                            <div>
                                <Icon name='spinner'/>
                                {' ' + msg('Loading...')}
                            </div>
                        )}
                    />
                    : <NoData
                        alignment='left'
                        message={msg('Select image and band.')}
                    />}
        </Widget>
    )
}

const SourceTypeButtons = ({type, onChange}) =>
    <Form.Buttons
        key='type'
        spacing='none'
        groupSpacing='none'
        size='x-small'
        shape='pill'
        input={type}
        options={[
            {
                value: 'ASSET',
                label: msg('process.samplingDesign.panel.proportions.form.type.ASSET.label'),
                tooltip: msg('process.samplingDesign.panel.proportions.form.type.ASSET.tooltip'),
            },
            {
                value: 'RECIPE',
                label: msg('process.samplingDesign.panel.proportions.form.type.RECIPE.label'),
                tooltip: msg('process.samplingDesign.panel.proportions.form.type.RECIPE.tooltip')
            },
        ]}
        onChange={onChange}
    />

const AssetSource = ({assetId, typeButtons, onImageChanged, onImageLoading, onAssetLoaded}) =>
    <Form.AssetCombo
        label={msg('process.samplingDesign.panel.proportions.form.image.label')}
        autoFocus
        input={assetId}
        placeholder={msg('process.samplingDesign.panel.proportions.form.image.placeholder')}
        allowedTypes={['Image', 'ImageCollection']}
        labelButtons={[typeButtons]}
        onChange={onImageChanged}
        onLoading={onImageLoading}
        onLoaded={onAssetLoaded}
    />

const RecipeSource = ({recipeId, typeButtons, onImageChanged, onImageLoading, onRecipeLoaded}) =>
    <RecipeInput
        label={msg('process.samplingDesign.panel.proportions.form.image.label')}
        input={recipeId}
        filter={type => !type.noImageOutput}
        labelButtons={[typeButtons]}
        autoFocus
        onChange={onImageChanged}
        onLoading={onImageLoading}
        onLoaded={onRecipeLoaded}
    />

const BandInput = ({band, percentage, probabilityPerStratum, anticipationStrategy, bands = [], onBandChanged, onPercentageChanged}) => {
    const options = bands
        .map(band => ({value: band, label: band}))
    // CATEGORICAL proportions are fractions [0,1] from the reducer, so the percentage toggle doesn't apply.
    const categorical = anticipationStrategy.value === 'CATEGORICAL'
    const forcePercentage = _.maxBy(probabilityPerStratum.value, 'probability')?.probability > 1
    const percentageButton = (
        <Form.Buttons
            key='percentage'
            input={percentage}
            look='transparent'
            shape='pill'
            air='less'
            size='x-small'
            options={[
                {value: true, label: '%', tooltip: 'Specify if band specify fraction or percentage'}
            ]}
            multiple
            tabIndex={-1}
            disabled={forcePercentage}
            onChange={onPercentageChanged}
        />
    )
    return (
        <FormCombo
            className={styles.band}
            input={band}
            disabled={!bands.length}
            options={options}
            label={msg('process.samplingDesign.panel.proportions.form.band.label')}
            placeholder={msg('process.samplingDesign.panel.proportions.form.band.placeholder')}
            tooltip={msg('process.samplingDesign.panel.proportions.form.band.tooltip')}
            buttons={categorical ? [] : [percentageButton]}
            onChange={onBandChanged}
        />
    )
}

const ScaleInput = ({scale}) =>
    <Form.Input
        className={styles.scale}
        label={msg('process.samplingDesign.panel.proportions.form.scale.label')}
        placeholder={msg('process.samplingDesign.panel.proportions.form.scale.placeholder')}
        tooltip={msg('process.samplingDesign.panel.proportions.form.scale.tooltip')}
        input={scale}
        type='number'
        suffix={msg('process.samplingDesign.panel.proportions.form.scale.suffix')}
    />

const TargetClassInput = ({band, targetClass, visualizations = [], distinctClassOptions, loading, canLoad, onLoad}) => {
    const label = msg('process.samplingDesign.panel.proportions.form.targetClass.label')
    const placeholder = msg('process.samplingDesign.panel.proportions.form.targetClass.placeholder')
    const tooltip = msg('process.samplingDesign.panel.proportions.form.targetClass.tooltip')
    // 1. Prefer the band's categorical legend metadata (no EE work needed).
    const entries = categoricalLegendEntries(visualizations, band.value)
    // 2. Otherwise use values discovered from the image band, once the user loads them.
    const options = entries.length
        ? entries.map(withClassOptionRender)
        : distinctClassOptions
    if (options?.length) {
        return (
            <FormCombo
                className={styles.targetClass}
                input={targetClass}
                options={options}
                label={label}
                placeholder={placeholder}
                tooltip={tooltip}
            />
        )
    }
    // 3. Fallback: a numeric class input with a user-triggered "Load values" action.
    const loadButton = (
        <Button
            key='loadClassValues'
            shape='pill'
            air='less'
            size='x-small'
            icon={loading ? 'spinner' : 'rotate'}
            label={msg(loading
                ? 'process.samplingDesign.panel.proportions.form.targetClass.loadingValues'
                : 'process.samplingDesign.panel.proportions.form.targetClass.loadValues')}
            disabled={!canLoad || loading}
            onClick={() => onLoad()}
        />
    )
    return (
        <Form.Input
            className={styles.targetClass}
            input={targetClass}
            type='number'
            label={label}
            placeholder={placeholder}
            tooltip={tooltip}
            buttons={[loadButton]}
        />
    )
}

const withClassOptionRender = option => ({
    ...option,
    render: option.color
        ? () => <ClassOption option={option}/>
        : undefined
})

const ClassOption = ({option: {color, label}}) =>
    <div className={styles.classOption}>
        <span className={styles.classOptionColor} style={{'--class-color': color}}/>
        <span>{label}</span>
    </div>

const EEStrategyButtons = ({eeStrategy}) =>
    <Form.Buttons
        spacing='none'
        groupSpacing='none'
        size='x-small'
        shape='pill'
        input={eeStrategy}
        options={[
            {
                value: 'ONLINE',
                label: msg('process.samplingDesign.panel.proportions.form.eeStrategy.online.label'),
                tooltip: msg('process.samplingDesign.panel.proportions.form.eeStrategy.online.tooltip')
            },
            {
                value: 'BATCH',
                label: msg('process.samplingDesign.panel.proportions.form.eeStrategy.batch.label'),
                tooltip: msg('process.samplingDesign.panel.proportions.form.eeStrategy.batch.tooltip')
            },
        ]}
    />
