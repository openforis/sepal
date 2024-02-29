import {Button} from 'widget/button'
import {Combo} from 'widget/combo'
import {Label} from 'widget/label'
import {msg} from 'translate'
import Color from 'color'
import React from 'react'
import _ from 'lodash'
import styles from './palettePreSets.module.css'

export const pickColors = (count, colors) => {
    if (count === 1) {
        return [colors[0]]
    }
    const colorFractions = colors.map((color, i) => i / (colors.length - 1))

    return _.range(0, count)
        .map(i => {
            const fraction = i / (count - 1)
            if (fraction === 0 || fraction === 1) {
                return colors[fraction === 0
                    ? 0
                    : colors.length - 1
                ]
            } else {
                const colorIndex = colorFractions.findIndex(f => f >= fraction)
                const fromFraction = colorFractions[colorIndex - 1]
                const fromColor = Color(colors[colorIndex - 1]).rgb().color
                const toFraction = colorFractions[colorIndex]
                const toColor = Color(colors[colorIndex]).rgb().color
                const factor = (fraction - fromFraction) / (toFraction - fromFraction)
                const interpolate = channel => fromColor[channel] + factor * (toColor[channel] - fromColor[channel])
                const interpolated = _.range(0, 3).map(interpolate)
                return Color(interpolated).hex()
            }
        })
}

export const PalettePreSets = ({onSelect, count, className, autoFocus, disabled}) => {
    const allOptions = [
        ...options,
        ...(count ? colorBrewerOptions(count) : [])
    ]
    return (
        <Combo
            className={className}
            autoFocus={autoFocus}
            placeholder={msg('map.visParams.form.palette.preset.placeholder')}
            placement='above'
            options={allOptions}
            buttons={[
                <Button
                    key={'attribution'}
                    chromeless
                    icon='external-link-alt'
                    shape={'pill'}
                    air={'less'}
                    size={'x-small'}
                    tooltip={msg('map.visParams.form.palette.preset.attribution', {
                        url: 'https://github.com/gee-community/ee-palettes'
                    })}
                    linkUrl={'https://github.com/gee-community/ee-palettes'}
                />
            ]}
            disabled={disabled}
            onChange={({value}) => onSelect(value)}
        />
    )
}

const renderOption = (value, label) => {
    return (
        <div
            className={styles.presetOption}
            style={{'--palette': value.join(', ')}}>
            <Label className={styles.presetLabel} msg={label}/>
        </div>
    )
}

const toOptions = options => options.map(({label, value}) => ({
    key: label, label, value, render: () => renderOption(value, label)
}))

const colorBrewerOptions = count =>
    [{
        label: 'Color Brewer',
        options: toOptions(colorBrewer.map(({label, colors}) =>
            ({
                label,
                value: colors[count]
                    || colors[Object.keys(colors).find(n => n >= count)]
                    || _.last(Object.values(colors))
            })))
    }]

const colorBrewer = [
    {label: 'YlGn', colors: {3: ['#f7fcb9', '#addd8e', '#31a354'], 4: ['#ffffcc', '#c2e699', '#78c679', '#238443'], 5: ['#ffffcc', '#c2e699', '#78c679', '#31a354', '#006837'], 6: ['#ffffcc', '#d9f0a3', '#addd8e', '#78c679', '#31a354', '#006837'], 7: ['#ffffcc', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#005a32'], 8: ['#ffffe5', '#f7fcb9', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#005a32'], 9: ['#ffffe5', '#f7fcb9', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529']}},
    {label: 'YlGnBu', colors: {3: ['#edf8b1', '#7fcdbb', '#2c7fb8'], 4: ['#ffffcc', '#a1dab4', '#41b6c4', '#225ea8'], 5: ['#ffffcc', '#a1dab4', '#41b6c4', '#2c7fb8', '#253494'], 6: ['#ffffcc', '#c7e9b4', '#7fcdbb', '#41b6c4', '#2c7fb8', '#253494'], 7: ['#ffffcc', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#0c2c84'], 8: ['#ffffd9', '#edf8b1', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#0c2c84'], 9: ['#ffffd9', '#edf8b1', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#253494', '#081d58']}},
    {label: 'GnBu', colors: {3: ['#e0f3db', '#a8ddb5', '#43a2ca'], 4: ['#f0f9e8', '#bae4bc', '#7bccc4', '#2b8cbe'], 5: ['#f0f9e8', '#bae4bc', '#7bccc4', '#43a2ca', '#0868ac'], 6: ['#f0f9e8', '#ccebc5', '#a8ddb5', '#7bccc4', '#43a2ca', '#0868ac'], 7: ['#f0f9e8', '#ccebc5', '#a8ddb5', '#7bccc4', '#4eb3d3', '#2b8cbe', '#08589e'], 8: ['#f7fcf0', '#e0f3db', '#ccebc5', '#a8ddb5', '#7bccc4', '#4eb3d3', '#2b8cbe', '#08589e'], 9: ['#f7fcf0', '#e0f3db', '#ccebc5', '#a8ddb5', '#7bccc4', '#4eb3d3', '#2b8cbe', '#0868ac', '#084081']}},
    {label: 'BuGn', colors: {3: ['#e5f5f9', '#99d8c9', '#2ca25f'], 4: ['#edf8fb', '#b2e2e2', '#66c2a4', '#238b45'], 5: ['#edf8fb', '#b2e2e2', '#66c2a4', '#2ca25f', '#006d2c'], 6: ['#edf8fb', '#ccece6', '#99d8c9', '#66c2a4', '#2ca25f', '#006d2c'], 7: ['#edf8fb', '#ccece6', '#99d8c9', '#66c2a4', '#41ae76', '#238b45', '#005824'], 8: ['#f7fcfd', '#e5f5f9', '#ccece6', '#99d8c9', '#66c2a4', '#41ae76', '#238b45', '#005824'], 9: ['#f7fcfd', '#e5f5f9', '#ccece6', '#99d8c9', '#66c2a4', '#41ae76', '#238b45', '#006d2c', '#00441b']}},
    {label: 'PuBuGn', colors: {3: ['#ece2f0', '#a6bddb', '#1c9099'], 4: ['#f6eff7', '#bdc9e1', '#67a9cf', '#02818a'], 5: ['#f6eff7', '#bdc9e1', '#67a9cf', '#1c9099', '#016c59'], 6: ['#f6eff7', '#d0d1e6', '#a6bddb', '#67a9cf', '#1c9099', '#016c59'], 7: ['#f6eff7', '#d0d1e6', '#a6bddb', '#67a9cf', '#3690c0', '#02818a', '#016450'], 8: ['#fff7fb', '#ece2f0', '#d0d1e6', '#a6bddb', '#67a9cf', '#3690c0', '#02818a', '#016450'], 9: ['#fff7fb', '#ece2f0', '#d0d1e6', '#a6bddb', '#67a9cf', '#3690c0', '#02818a', '#016c59', '#014636']}},
    {label: 'PuBu', colors: {3: ['#ece7f2', '#a6bddb', '#2b8cbe'], 4: ['#f1eef6', '#bdc9e1', '#74a9cf', '#0570b0'], 5: ['#f1eef6', '#bdc9e1', '#74a9cf', '#2b8cbe', '#045a8d'], 6: ['#f1eef6', '#d0d1e6', '#a6bddb', '#74a9cf', '#2b8cbe', '#045a8d'], 7: ['#f1eef6', '#d0d1e6', '#a6bddb', '#74a9cf', '#3690c0', '#0570b0', '#034e7b'], 8: ['#fff7fb', '#ece7f2', '#d0d1e6', '#a6bddb', '#74a9cf', '#3690c0', '#0570b0', '#034e7b'], 9: ['#fff7fb', '#ece7f2', '#d0d1e6', '#a6bddb', '#74a9cf', '#3690c0', '#0570b0', '#045a8d', '#023858']}},
    {label: 'BuPu', colors: {3: ['#e0ecf4', '#9ebcda', '#8856a7'], 4: ['#edf8fb', '#b3cde3', '#8c96c6', '#88419d'], 5: ['#edf8fb', '#b3cde3', '#8c96c6', '#8856a7', '#810f7c'], 6: ['#edf8fb', '#bfd3e6', '#9ebcda', '#8c96c6', '#8856a7', '#810f7c'], 7: ['#edf8fb', '#bfd3e6', '#9ebcda', '#8c96c6', '#8c6bb1', '#88419d', '#6e016b'], 8: ['#f7fcfd', '#e0ecf4', '#bfd3e6', '#9ebcda', '#8c96c6', '#8c6bb1', '#88419d', '#6e016b'], 9: ['#f7fcfd', '#e0ecf4', '#bfd3e6', '#9ebcda', '#8c96c6', '#8c6bb1', '#88419d', '#810f7c', '#4d004b']}},
    {label: 'RdPu', colors: {3: ['#fde0dd', '#fa9fb5', '#c51b8a'], 4: ['#feebe2', '#fbb4b9', '#f768a1', '#ae017e'], 5: ['#feebe2', '#fbb4b9', '#f768a1', '#c51b8a', '#7a0177'], 6: ['#feebe2', '#fcc5c0', '#fa9fb5', '#f768a1', '#c51b8a', '#7a0177'], 7: ['#feebe2', '#fcc5c0', '#fa9fb5', '#f768a1', '#dd3497', '#ae017e', '#7a0177'], 8: ['#fff7f3', '#fde0dd', '#fcc5c0', '#fa9fb5', '#f768a1', '#dd3497', '#ae017e', '#7a0177'], 9: ['#fff7f3', '#fde0dd', '#fcc5c0', '#fa9fb5', '#f768a1', '#dd3497', '#ae017e', '#7a0177', '#49006a']}},
    {label: 'PuRd', colors: {3: ['#e7e1ef', '#c994c7', '#dd1c77'], 4: ['#f1eef6', '#d7b5d8', '#df65b0', '#ce1256'], 5: ['#f1eef6', '#d7b5d8', '#df65b0', '#dd1c77', '#980043'], 6: ['#f1eef6', '#d4b9da', '#c994c7', '#df65b0', '#dd1c77', '#980043'], 7: ['#f1eef6', '#d4b9da', '#c994c7', '#df65b0', '#e7298a', '#ce1256', '#91003f'], 8: ['#f7f4f9', '#e7e1ef', '#d4b9da', '#c994c7', '#df65b0', '#e7298a', '#ce1256', '#91003f'], 9: ['#f7f4f9', '#e7e1ef', '#d4b9da', '#c994c7', '#df65b0', '#e7298a', '#ce1256', '#980043', '#67001f']}},
    {label: 'OrRd', colors: {3: ['#fee8c8', '#fdbb84', '#e34a33'], 4: ['#fef0d9', '#fdcc8a', '#fc8d59', '#d7301f'], 5: ['#fef0d9', '#fdcc8a', '#fc8d59', '#e34a33', '#b30000'], 6: ['#fef0d9', '#fdd49e', '#fdbb84', '#fc8d59', '#e34a33', '#b30000'], 7: ['#fef0d9', '#fdd49e', '#fdbb84', '#fc8d59', '#ef6548', '#d7301f', '#990000'], 8: ['#fff7ec', '#fee8c8', '#fdd49e', '#fdbb84', '#fc8d59', '#ef6548', '#d7301f', '#990000'], 9: ['#fff7ec', '#fee8c8', '#fdd49e', '#fdbb84', '#fc8d59', '#ef6548', '#d7301f', '#b30000', '#7f0000']}},
    {label: 'YlOrRd', colors: {3: ['#ffeda0', '#feb24c', '#f03b20'], 4: ['#ffffb2', '#fecc5c', '#fd8d3c', '#e31a1c'], 5: ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026'], 6: ['#ffffb2', '#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'], 7: ['#ffffb2', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#b10026'], 8: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#b10026'], 9: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026']}},
    {label: 'YlOrBr', colors: {3: ['#fff7bc', '#fec44f', '#d95f0e'], 4: ['#ffffd4', '#fed98e', '#fe9929', '#cc4c02'], 5: ['#ffffd4', '#fed98e', '#fe9929', '#d95f0e', '#993404'], 6: ['#ffffd4', '#fee391', '#fec44f', '#fe9929', '#d95f0e', '#993404'], 7: ['#ffffd4', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#8c2d04'], 8: ['#ffffe5', '#fff7bc', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#8c2d04'], 9: ['#ffffe5', '#fff7bc', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#993404', '#662506']}},
    {label: 'Purples', colors: {3: ['#efedf5', '#bcbddc', '#756bb1'], 4: ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#6a51a3'], 5: ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f'], 6: ['#f2f0f7', '#dadaeb', '#bcbddc', '#9e9ac8', '#756bb1', '#54278f'], 7: ['#f2f0f7', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#4a1486'], 8: ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#4a1486'], 9: ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#54278f', '#3f007d']}},
    {label: 'Blues', colors: {3: ['#deebf7', '#9ecae1', '#3182bd'], 4: ['#eff3ff', '#bdd7e7', '#6baed6', '#2171b5'], 5: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'], 6: ['#eff3ff', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'], 7: ['#eff3ff', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'], 8: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'], 9: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b']}},
    {label: 'Greens', colors: {3: ['#e5f5e0', '#a1d99b', '#31a354'], 4: ['#edf8e9', '#bae4b3', '#74c476', '#238b45'], 5: ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c'], 6: ['#edf8e9', '#c7e9c0', '#a1d99b', '#74c476', '#31a354', '#006d2c'], 7: ['#edf8e9', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#005a32'], 8: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#005a32'], 9: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b']}},
    {label: 'Oranges', colors: {3: ['#fee6ce', '#fdae6b', '#e6550d'], 4: ['#feedde', '#fdbe85', '#fd8d3c', '#d94701'], 5: ['#feedde', '#fdbe85', '#fd8d3c', '#e6550d', '#a63603'], 6: ['#feedde', '#fdd0a2', '#fdae6b', '#fd8d3c', '#e6550d', '#a63603'], 7: ['#feedde', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#8c2d04'], 8: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#8c2d04'], 9: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#a63603', '#7f2704']}},
    {label: 'Reds', colors: {3: ['#fee0d2', '#fc9272', '#de2d26'], 4: ['#fee5d9', '#fcae91', '#fb6a4a', '#cb181d'], 5: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'], 6: ['#fee5d9', '#fcbba1', '#fc9272', '#fb6a4a', '#de2d26', '#a50f15'], 7: ['#fee5d9', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#99000d'], 8: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#99000d'], 9: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d']}},
    {label: 'Greys', colors: {3: ['#f0f0f0', '#bdbdbd', '#636363'], 4: ['#f7f7f7', '#cccccc', '#969696', '#525252'], 5: ['#f7f7f7', '#cccccc', '#969696', '#636363', '#252525'], 6: ['#f7f7f7', '#d9d9d9', '#bdbdbd', '#969696', '#636363', '#252525'], 7: ['#f7f7f7', '#d9d9d9', '#bdbdbd', '#969696', '#737373', '#525252', '#252525'], 8: ['#ffffff', '#f0f0f0', '#d9d9d9', '#bdbdbd', '#969696', '#737373', '#525252', '#252525'], 9: ['#ffffff', '#f0f0f0', '#d9d9d9', '#bdbdbd', '#969696', '#737373', '#525252', '#252525', '#000000']}},
    {label: 'PuOr', colors: {3: ['#f1a340', '#f7f7f7', '#998ec3'], 4: ['#e66101', '#fdb863', '#b2abd2', '#5e3c99'], 5: ['#e66101', '#fdb863', '#f7f7f7', '#b2abd2', '#5e3c99'], 6: ['#b35806', '#f1a340', '#fee0b6', '#d8daeb', '#998ec3', '#542788'], 7: ['#b35806', '#f1a340', '#fee0b6', '#f7f7f7', '#d8daeb', '#998ec3', '#542788'], 8: ['#b35806', '#e08214', '#fdb863', '#fee0b6', '#d8daeb', '#b2abd2', '#8073ac', '#542788'], 9: ['#b35806', '#e08214', '#fdb863', '#fee0b6', '#f7f7f7', '#d8daeb', '#b2abd2', '#8073ac', '#542788'], 10: ['#7f3b08', '#b35806', '#e08214', '#fdb863', '#fee0b6', '#d8daeb', '#b2abd2', '#8073ac', '#542788', '#2d004b'], 11: ['#7f3b08', '#b35806', '#e08214', '#fdb863', '#fee0b6', '#f7f7f7', '#d8daeb', '#b2abd2', '#8073ac', '#542788', '#2d004b']}},
    {label: 'BrBG', colors: {3: ['#d8b365', '#f5f5f5', '#5ab4ac'], 4: ['#a6611a', '#dfc27d', '#80cdc1', '#018571'], 5: ['#a6611a', '#dfc27d', '#f5f5f5', '#80cdc1', '#018571'], 6: ['#8c510a', '#d8b365', '#f6e8c3', '#c7eae5', '#5ab4ac', '#01665e'], 7: ['#8c510a', '#d8b365', '#f6e8c3', '#f5f5f5', '#c7eae5', '#5ab4ac', '#01665e'], 8: ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#c7eae5', '#80cdc1', '#35978f', '#01665e'], 9: ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e'], 10: ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30'], 11: ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30']}},
    {label: 'PRGn', colors: {3: ['#af8dc3', '#f7f7f7', '#7fbf7b'], 4: ['#7b3294', '#c2a5cf', '#a6dba0', '#008837'], 5: ['#7b3294', '#c2a5cf', '#f7f7f7', '#a6dba0', '#008837'], 6: ['#762a83', '#af8dc3', '#e7d4e8', '#d9f0d3', '#7fbf7b', '#1b7837'], 7: ['#762a83', '#af8dc3', '#e7d4e8', '#f7f7f7', '#d9f0d3', '#7fbf7b', '#1b7837'], 8: ['#762a83', '#9970ab', '#c2a5cf', '#e7d4e8', '#d9f0d3', '#a6dba0', '#5aae61', '#1b7837'], 9: ['#762a83', '#9970ab', '#c2a5cf', '#e7d4e8', '#f7f7f7', '#d9f0d3', '#a6dba0', '#5aae61', '#1b7837'], 10: ['#40004b', '#762a83', '#9970ab', '#c2a5cf', '#e7d4e8', '#d9f0d3', '#a6dba0', '#5aae61', '#1b7837', '#00441b'], 11: ['#40004b', '#762a83', '#9970ab', '#c2a5cf', '#e7d4e8', '#f7f7f7', '#d9f0d3', '#a6dba0', '#5aae61', '#1b7837', '#00441b']}},
    {label: 'PiYG', colors: {3: ['#e9a3c9', '#f7f7f7', '#a1d76a'], 4: ['#d01c8b', '#f1b6da', '#b8e186', '#4dac26'], 5: ['#d01c8b', '#f1b6da', '#f7f7f7', '#b8e186', '#4dac26'], 6: ['#c51b7d', '#e9a3c9', '#fde0ef', '#e6f5d0', '#a1d76a', '#4d9221'], 7: ['#c51b7d', '#e9a3c9', '#fde0ef', '#f7f7f7', '#e6f5d0', '#a1d76a', '#4d9221'], 8: ['#c51b7d', '#de77ae', '#f1b6da', '#fde0ef', '#e6f5d0', '#b8e186', '#7fbc41', '#4d9221'], 9: ['#c51b7d', '#de77ae', '#f1b6da', '#fde0ef', '#f7f7f7', '#e6f5d0', '#b8e186', '#7fbc41', '#4d9221'], 10: ['#8e0152', '#c51b7d', '#de77ae', '#f1b6da', '#fde0ef', '#e6f5d0', '#b8e186', '#7fbc41', '#4d9221', '#276419'], 11: ['#8e0152', '#c51b7d', '#de77ae', '#f1b6da', '#fde0ef', '#f7f7f7', '#e6f5d0', '#b8e186', '#7fbc41', '#4d9221', '#276419']}},
    {label: 'RdBu', colors: {3: ['#ef8a62', '#f7f7f7', '#67a9cf'], 4: ['#ca0020', '#f4a582', '#92c5de', '#0571b0'], 5: ['#ca0020', '#f4a582', '#f7f7f7', '#92c5de', '#0571b0'], 6: ['#b2182b', '#ef8a62', '#fddbc7', '#d1e5f0', '#67a9cf', '#2166ac'], 7: ['#b2182b', '#ef8a62', '#fddbc7', '#f7f7f7', '#d1e5f0', '#67a9cf', '#2166ac'], 8: ['#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac'], 9: ['#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac'], 10: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061'], 11: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061']}},
    {label: 'RdGy', colors: {3: ['#ef8a62', '#ffffff', '#999999'], 4: ['#ca0020', '#f4a582', '#bababa', '#404040'], 5: ['#ca0020', '#f4a582', '#ffffff', '#bababa', '#404040'], 6: ['#b2182b', '#ef8a62', '#fddbc7', '#e0e0e0', '#999999', '#4d4d4d'], 7: ['#b2182b', '#ef8a62', '#fddbc7', '#ffffff', '#e0e0e0', '#999999', '#4d4d4d'], 8: ['#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#e0e0e0', '#bababa', '#878787', '#4d4d4d'], 9: ['#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#ffffff', '#e0e0e0', '#bababa', '#878787', '#4d4d4d'], 10: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#e0e0e0', '#bababa', '#878787', '#4d4d4d', '#1a1a1a'], 11: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#ffffff', '#e0e0e0', '#bababa', '#878787', '#4d4d4d', '#1a1a1a']}},
    {label: 'RdYlBu', colors: {3: ['#fc8d59', '#ffffbf', '#91bfdb'], 4: ['#d7191c', '#fdae61', '#abd9e9', '#2c7bb6'], 5: ['#d7191c', '#fdae61', '#ffffbf', '#abd9e9', '#2c7bb6'], 6: ['#d73027', '#fc8d59', '#fee090', '#e0f3f8', '#91bfdb', '#4575b4'], 7: ['#d73027', '#fc8d59', '#fee090', '#ffffbf', '#e0f3f8', '#91bfdb', '#4575b4'], 8: ['#d73027', '#f46d43', '#fdae61', '#fee090', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4'], 9: ['#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4'], 10: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'], 11: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695']}},
    {label: 'Spectral', colors: {3: ['#fc8d59', '#ffffbf', '#99d594'], 4: ['#d7191c', '#fdae61', '#abdda4', '#2b83ba'], 5: ['#d7191c', '#fdae61', '#ffffbf', '#abdda4', '#2b83ba'], 6: ['#d53e4f', '#fc8d59', '#fee08b', '#e6f598', '#99d594', '#3288bd'], 7: ['#d53e4f', '#fc8d59', '#fee08b', '#ffffbf', '#e6f598', '#99d594', '#3288bd'], 8: ['#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#e6f598', '#abdda4', '#66c2a5', '#3288bd'], 9: ['#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd'], 10: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'], 11: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2']}},
    {label: 'RdYlGn', colors: {3: ['#fc8d59', '#ffffbf', '#91cf60'], 4: ['#d7191c', '#fdae61', '#a6d96a', '#1a9641'], 5: ['#d7191c', '#fdae61', '#ffffbf', '#a6d96a', '#1a9641'], 6: ['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#91cf60', '#1a9850'], 7: ['#d73027', '#fc8d59', '#fee08b', '#ffffbf', '#d9ef8b', '#91cf60', '#1a9850'], 8: ['#d73027', '#f46d43', '#fdae61', '#fee08b', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850'], 9: ['#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850'], 10: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee08b', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837'], 11: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837']}},
    {label: 'Accent', colors: {3: ['#7fc97f', '#beaed4', '#fdc086'], 4: ['#7fc97f', '#beaed4', '#fdc086', '#ffff99'], 5: ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0'], 6: ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0', '#f0027f'], 7: ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0', '#f0027f', '#bf5b17'], 8: ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0', '#f0027f', '#bf5b17', '#666666']}},
    {label: 'Dark2', colors: {3: ['#1b9e77', '#d95f02', '#7570b3'], 4: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a'], 5: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e'], 6: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02'], 7: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d'], 8: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666']}},
    {label: 'Pastel1', colors: {3: ['#fbb4ae', '#b3cde3', '#ccebc5'], 4: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4'], 5: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6'], 6: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc'], 7: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd'], 8: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec'], 9: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2']}},
    {label: 'Pastel2', colors: {3: ['#b3e2cd', '#fdcdac', '#cbd5e8'], 4: ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4'], 5: ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4', '#e6f5c9'], 6: ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4', '#e6f5c9', '#fff2ae'], 7: ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4', '#e6f5c9', '#fff2ae', '#f1e2cc'], 8: ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4', '#e6f5c9', '#fff2ae', '#f1e2cc', '#cccccc']}},
    {label: 'Paired', colors: {3: ['#a6cee3', '#1f78b4', '#b2df8a'], 4: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c'], 5: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99'], 6: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c'], 7: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f'], 8: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00'], 9: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6'], 10: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a'], 11: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99'], 12: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928']}},
    {label: 'Set1', colors: {3: ['#e41a1c', '#377eb8', '#4daf4a'], 4: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3'], 5: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00'], 6: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33'], 7: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628'], 8: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf'], 9: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999']}},
    {label: 'Set2', colors: {3: ['#66c2a5', '#fc8d62', '#8da0cb'], 4: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3'], 5: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854'], 6: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f'], 7: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494'], 8: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3']}},
    {label: 'Set3', colors: {3: ['#8dd3c7', '#ffffb3', '#bebada'], 4: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072'], 5: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3'], 6: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462'], 7: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69'], 8: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5'], 9: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9'], 10: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd'], 11: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd', '#ccebc5'], 12: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd', '#ccebc5', '#ffed6f']}}
]

const options = [
    {label: 'cmocean', options: toOptions([
        {label: 'Thermal', value: ['#042333', '#2c3395', '#744992', '#b15f82', '#eb7958', '#fbb43d', '#e8fa5b']},
        {label: 'Haline', value: ['#2a186c', '#14439c', '#206e8b', '#3c9387', '#5ab978', '#aad85c', '#fdef9a']},
        {label: 'Solar', value: ['#331418', '#682325', '#973b1c', '#b66413', '#cb921a', '#dac62f', '#e1fd4b']},
        {label: 'Ice', value: ['#040613', '#292851', '#3f4b96', '#427bb7', '#61a8c7', '#9cd4da', '#eafdfd']},
        {label: 'Gray', value: ['#000000', '#232323', '#4a4a49', '#727171', '#9b9a9a', '#cacac9', '#fffffd']},
        {label: 'Oxy', value: ['#400505', '#850a0b', '#6f6f6e', '#9b9a9a', '#cbcac9', '#ebf34b', '#ddaf19']},
        {label: 'Deep', value: ['#fdfecc', '#a5dfa7', '#5dbaa4', '#488e9e', '#3e6495', '#3f396c', '#281a2c']},
        {label: 'Dense', value: ['#e6f1f1', '#a2cee2', '#76a4e5', '#7871d5', '#7642a5', '#621d62', '#360e24']},
        {label: 'Algae', value: ['#d7f9d0', '#a2d595', '#64b463', '#129450', '#126e45', '#1a482f', '#122414']},
        {label: 'Matter', value: ['#feedb0', '#f7b37c', '#eb7858', '#ce4356', '#9f2462', '#66185c', '#2f0f3e']},
        {label: 'Turbid', value: ['#e9f6ab', '#d3c671', '#bf9747', '#a1703b', '#795338', '#4d392d', '#221f1b']},
        {label: 'Speed', value: ['#fffdcd', '#e1cd73', '#aaac20', '#5f920c', '#187328', '#144b2a', '#172313']},
        {label: 'Amp', value: ['#f1edec', '#dfbcb0', '#d08b73', '#c0583b', '#a62225', '#730e27', '#3c0912']},
        {label: 'Tempo', value: ['#fff6f4', '#c3d1ba', '#7db390', '#2a937f', '#156d73', '#1c455b', '#151d44']},
        {label: 'Phase', value: ['#a8780d', '#d74957', '#d02fd0', '#7d73f0', '#1e93a8', '#359943', '#a8780d']},
        {label: 'Balance', value: ['#181c43', '#0c5ebe', '#75aabe', '#f1eceb', '#d08b73', '#a52125', '#3c0912']},
        {label: 'Delta', value: ['#112040', '#1c67a0', '#6db6b3', '#fffccc', '#abac21', '#177228', '#172313']},
        {label: 'Curl', value: ['#151d44', '#156c72', '#7eb390', '#fdf5f4', '#db8d77', '#9c3060', '#340d35']}
    ])},
    {label: 'crameri', options: toOptions([
        {label: 'acton', value: ['#2E214D', '#4B3B66', '#6E5480', '#926390', '#B26795', '#D17BA5', '#D495B8', '#D4ADC9', '#DBC9DC', '#E6E6F0']},
        {label: 'bamako', value: ['#00404D', '#134B42', '#265737', '#3A652A', '#52741C', '#71870B', '#969206', '#C5AE32', '#E7CD68', '#FFE599']},
        {label: 'berlin', value: ['#9EB0FF', '#5BA4DB', '#2D7597', '#1A4256', '#11191E', '#280D01', '#501803', '#8A3F2A', '#C4756A', '#FFADAD']},
        {label: 'bilbao', value: ['#FFFFFF', '#DCDBD9', '#C5C0AF', '#B9AF8B', '#AE946D', '#A67A60', '#9E6155', '#8D4341', '#6E2222', '#4D0001']},
        {label: 'broc', value: ['#2C1A4C', '#284477', '#4B76A0', '#8BA7C2', '#CED9E5', '#E8E8D2', '#C5C58F', '#8D8D56', '#555527', '#262600']},
        {label: 'buda', value: ['#B301B3', '#B32B9E', '#B94892', '#C2618A', '#CA7982', '#D1917B', '#D7AA75', '#DDC36F', '#E5DF68', '#FFFF66']},
        {label: 'cork', value: ['#2C1A4C', '#2A4375', '#48729E', '#84A1BE', '#C3D2DF', '#CDE1CF', '#95C199', '#5E9F62', '#407027', '#424D03']},
        {label: 'davos', value: ['#00054A', '#112C71', '#295291', '#43709D', '#5E8598', '#79968D', '#99AD88', '#C9D29E', '#F3F3D2', '#FEFEFE']},
        {label: 'devon', value: ['#2C1A4C', '#293467', '#275186', '#3669AD', '#6181D0', '#989BE7', '#BAB3F1', '#D0CCF5', '#E8E5FA', '#FFFFFF']},
        {label: 'grayC', value: ['#FFFFFF', '#E0E0E0', '#C0C0C0', '#A2A2A2', '#858585', '#696969', '#4E4E4E', '#353535', '#1D1D1D', '#000000']},
        {label: 'hawaii', value: ['#8C0273', '#922A59', '#964742', '#996330', '#9D831E', '#97A92A', '#80C55F', '#66D89C', '#6CEBDB', '#B3F2FD']},
        {label: 'imola', value: ['#1A33B3', '#2446A9', '#2E599F', '#396B94', '#497B85', '#60927B', '#7BAE74', '#98CB6D', '#C4EA67', '#FFFF66']},
        {label: 'lajolla', value: ['#FFFFCC', '#FBEC9A', '#F4CC68', '#ECA855', '#E48751', '#D2624D', '#A54742', '#73382F', '#422818', '#1A1A01']},
        {label: 'lapaz', value: ['#1A0C64', '#232D7B', '#2A4C8F', '#36679D', '#4C80A3', '#6E95A1', '#94A298', '#BFB199', '#EFD3C0', '#FEF2F3']},
        {label: 'lisbon', value: ['#E6E5FF', '#9BAFD3', '#5177A4', '#1E4368', '#111E2C', '#27251A', '#575134', '#8D8556', '#C9C390', '#FFFFD9']},
        {label: 'nuuk', value: ['#05598C', '#296284', '#4A7283', '#6F878D', '#929C96', '#ABAD96', '#BAB98D', '#C7C684', '#E0E08E', '#FEFEB2']},
        {label: 'oleron', value: ['#1A2659', '#455285', '#7784B7', '#AAB7E8', '#D3E0FA', '#3C5600', '#7A711F', '#B79A5E', '#F1CEA4', '#FDFDE6']},
        {label: 'oslo', value: ['#010101', '#0D1B29', '#133251', '#1F4C7B', '#3869A8', '#658AC7', '#89A0CA', '#AAB6CA', '#D4D6DB', '#FFFFFF']},
        {label: 'roma', value: ['#7F1900', '#9D5918', '#B99333', '#D9CF6D', '#DFEAB2', '#A9E4D5', '#61BDD3', '#428CBF', '#2F5EAB', '#1A3399']},
        {label: 'tofino', value: ['#DED9FF', '#93A4DE', '#4A6BAC', '#273C65', '#121926', '#122214', '#244D28', '#3F8144', '#88B970', '#DBE69B']},
        {label: 'tokyo', value: ['#1A0E34', '#45204C', '#6E3E67', '#855E78', '#8D7982', '#929489', '#97AE91', '#A7CE9D', '#D5F2BC', '#FEFED8']},
        {label: 'turku', value: ['#000000', '#242420', '#424235', '#5F5F44', '#7E7C52', '#A99965', '#CFA67C', '#EAAD98', '#FCC7C3', '#FFE6E6']},
        {label: 'vik', value: ['#001261', '#033E7D', '#1E6F9D', '#71A8C4', '#C9DDE7', '#EACEBD', '#D39774', '#BE6533', '#8B2706', '#590008']}
    ])},
    {label: 'kovesi', options: toOptions([
        {label: 'cyclic grey 15 85 c0', value: ['#787878', '#B0B0B0', '#B0B0B0', '#767676', '#414141', '#424242', '#767676']},
        {label: 'cyclic grey 15 85 c0 s25', value: ['#2D2D2D', '#5B5B5B', '#949494', '#CACACA', '#949494', '#5A5A5A', '#2D2D2D']},
        {label: 'cyclic mrybm 35 75 c68', value: ['#F985F8', '#D82D5F', '#C14E04', '#D0AA25', '#2C76B1', '#7556F9', '#F785F9']},
        {label: 'cyclic mrybm 35 75 c68 s25', value: ['#3E3FF0', '#B976FC', '#F55CB1', '#B71C18', '#D28004', '#8E9871', '#3C40EE']},
        {label: 'cyclic mygbm 30 95 c78', value: ['#EF55F2', '#FCC882', '#B8E014', '#32AD26', '#2F5DB9', '#712AF7', '#ED53F3']},
        {label: 'cyclic mygbm 30 95 c78 s25', value: ['#2E22EA', '#B341FB', '#FC93C0', '#F1ED37', '#77C80D', '#458873', '#2C24E9']},
        {label: 'cyclic wrwbw 40 90 c42', value: ['#DFD5D8', '#D9694D', '#D86449', '#DDD1D6', '#6C81E5', '#6F83E5', '#DDD5DA']},
        {label: 'cyclic wrwbw 40 90 c42 s25', value: ['#1A63E5', '#B0B2E4', '#E4A695', '#C93117', '#E3A18F', '#ADB0E4', '#1963E5']},
        {label: 'diverging isoluminant cjm 75 c23', value: ['#00C9FF', '#69C3E8', '#98BED0', '#B8B8BB', '#CBB1C6', '#DCA8D5', '#ED9EE4']},
        {label: 'diverging isoluminant cjm 75 c24', value: ['#00CBFE', '#62C5E7', '#96BFD0', '#B8B8BB', '#CCB1C8', '#DEA7D6', '#F09DE6']},
        {label: 'diverging isoluminant cjo 70 c25', value: ['#00B6FF', '#67B2E4', '#8FAFC7', '#ABABAB', '#C7A396', '#E09A81', '#F6906D']},
        {label: 'diverging linear bjr 30 55 c53', value: ['#002AD7', '#483FB0', '#5E528A', '#646464', '#A15C49', '#D44A2C', '#FF1900']},
        {label: 'diverging linear bjy 30 90 c45', value: ['#1431C1', '#5A50B2', '#796FA2', '#938F8F', '#B8AB74', '#DAC652', '#FDE409']},
        {label: 'diverging rainbow bgymr 45 85 c67', value: ['#085CF8', '#3C9E49', '#98BB18', '#F3CC1D', '#FE8F7B', '#F64497', '#D70500']},
        {label: 'diverging bkr 55 10 c35', value: ['#1981FA', '#315CA9', '#2D3B5E', '#221F21', '#5C2F28', '#9E4035', '#E65041']},
        {label: 'diverging bky 60 10 c30', value: ['#0E94FA', '#2F68A9', '#2D405E', '#212020', '#4C3E20', '#7D6321', '#B38B1A']},
        {label: 'diverging bwr 40 95 c42', value: ['#2151DB', '#8182E3', '#BCB7EB', '#EBE2E6', '#EEAD9D', '#DC6951', '#C00206']},
        {label: 'diverging bwr 55 98 c37', value: ['#2480FF', '#88A4FD', '#C4CDFC', '#F8F6F7', '#FDC1B3', '#F58B73', '#E65037']},
        {label: 'diverging cwm 80 100 c22', value: ['#00D9FF', '#89E6FF', '#C9F2FF', '#FEFFFF', '#FEE3FA', '#FCC9F5', '#FAAEF0']},
        {label: 'diverging gkr 60 10 c40', value: ['#36A616', '#347420', '#2B4621', '#22201D', '#633226', '#AC462F', '#FD5838']},
        {label: 'diverging gwr 55 95 c38', value: ['#39970E', '#7DB461', '#B7D2A7', '#EDEAE6', '#F9BAB2', '#F78579', '#ED4744']},
        {label: 'diverging gwv 55 95 c39', value: ['#39970E', '#7DB461', '#B7D2A7', '#EBEBEA', '#E0BEED', '#CD8DE9', '#B859E4']},
        {label: 'isoluminant cgo 70 c39', value: ['#37B7EC', '#4DBAC6', '#63BB9E', '#86B876', '#B3AE60', '#D8A05F', '#F6906D']},
        {label: 'isoluminant cgo 80 c38', value: ['#70D1FF', '#74D4E0', '#80D6BA', '#9BD594', '#C4CC7D', '#EABF77', '#FFB281']},
        {label: 'isoluminant cm 70 c39', value: ['#14BAE6', '#5DB2EA', '#8CAAEB', '#B0A1E3', '#CF98D3', '#E98FC1', '#FE85AD']},
        {label: 'rainbow bgyr 35 85 c72', value: ['#0034F5', '#1E7D83', '#4DA910', '#B3C120', '#FCC228', '#FF8410', '#FD3000']},
        {label: 'rainbow bgyr 35 85 c73', value: ['#0035F9', '#1E7D83', '#4DA910', '#B3C01A', '#FDC120', '#FF8303', '#FF2A00']},
        {label: 'rainbow bgyrm 35 85 c69', value: ['#0030F5', '#36886A', '#82B513', '#EDC823', '#F68E19', '#F45A44', '#FD92FA']},
        {label: 'rainbow bgyrm 35 85 c71', value: ['#0035F9', '#34886A', '#80B412', '#F1CA24', '#FD8814', '#FE4E41', '#FD92FA']},
        {label: 'linear bgy 10 95 c74', value: ['#000C7D', '#002CB9', '#005EA3', '#198E61', '#32BA1A', '#70E21A', '#FFF123']},
        {label: 'linear bgyw 15 100 c67', value: ['#1B0084', '#1D26C7', '#2E68AB', '#4C9A41', '#95BE16', '#E1DB41', '#FFFFFF']},
        {label: 'linear bgyw 15 100 c68', value: ['#1A0086', '#1B27C8', '#2469AD', '#4B9B41', '#95BE16', '#E1DB41', '#FFFFFF']},
        {label: 'linear blue 5 95 c73', value: ['#00014E', '#0E02A8', '#2429F4', '#2D6CFD', '#36A3FD', '#2CD8FA', '#B3FFF6']},
        {label: 'linear blue 95 50 c20', value: ['#F1F1F1', '#D0DCEC', '#B1C8E6', '#93B5DC', '#7BA1CA', '#5E8EBC', '#3B7CB2']},
        {label: 'linear bmw 5 95 c86', value: ['#00024B', '#0708A6', '#451AF4', '#B621FE', '#F957FE', '#FEA8FD', '#FEEBFE']},
        {label: 'linear bmw 5 95 c89', value: ['#000558', '#0014BF', '#251EFA', '#B71EFF', '#F655FF', '#FFA6FF', '#FEEBFE']},
        {label: 'linear bmy 10 95 c71', value: ['#000F5D', '#48188F', '#A60B8A', '#E4336F', '#F97E4A', '#FCBE39', '#F5F94E']},
        {label: 'linear bmy 10 95 c78', value: ['#000C7D', '#3013A7', '#A7018B', '#EE1774', '#FF7051', '#FFB722', '#FFF123']},
        {label: 'linear gow 60 85 c27', value: ['#669B90', '#87A37D', '#B4A671', '#D4AC6A', '#D8B97A', '#D7C6A6', '#D4D4D4']},
        {label: 'linear gow 65 90 c35', value: ['#70AD5C', '#A3B061', '#CCB267', '#E6B86D', '#E7C786', '#E5D5B3', '#E2E2E2']},
        {label: 'linear green 5 95 c69', value: ['#011506', '#093805', '#146007', '#1F890B', '#2AB610', '#35E415', '#D8FF15']},
        {label: 'linear grey 0 100 c0', value: ['#000000', '#272727', '#4E4E4E', '#777777', '#A2A2A2', '#CFCFCF', '#FFFFFF']},
        {label: 'linear grey 10 95 c0', value: ['#1B1B1B', '#393939', '#5A5A5A', '#7D7D7D', '#A2A2A2', '#C9C9C9', '#F1F1F1']},
        {label: 'linear kry 5 95 c72', value: ['#111111', '#660304', '#A80502', '#E72205', '#FE7310', '#F4BE26', '#F7F909']},
        {label: 'linear kry 5 98 c75', value: ['#111111', '#6B0004', '#AF0000', '#F50C00', '#FF7705', '#FFBF13', '#FFFE1C']},
        {label: 'linear kryw 5 100 c64', value: ['#111111', '#6A0303', '#B00703', '#F02C06', '#FE8714', '#F3CE4C', '#FFFFFF']},
        {label: 'linear kryw 5 100 c67', value: ['#111111', '#6C0004', '#B20000', '#F81300', '#FF7D05', '#FFC43E', '#FFFFFF']},
        {label: 'linear ternary blue 0 44 c57', value: ['#000000', '#051238', '#091F5E', '#0D2B83', '#1139AB', '#1546D3', '#1A54FF']},
        {label: 'linear ternary green 0 46 c42', value: ['#000000', '#001C00', '#002E00', '#004100', '#005500', '#006900', '#008000']},
        {label: 'linear ternary red 0 50 c52', value: ['#000000', '#320900', '#531000', '#761600', '#991C00', '#BE2400', '#E62B00']}
    ])},
    {label: 'matplotlib', options: toOptions([
        {label: 'magma', value: ['#000004', '#2C105C', '#711F81', '#B63679', '#EE605E', '#FDAE78', '#FCFDBF']},
        {label: 'inferno', value: ['#000004', '#320A5A', '#781B6C', '#BB3654', '#EC6824', '#FBB41A', '#FCFFA4']},
        {label: 'plasma', value: ['#0D0887', '#5B02A3', '#9A179B', '#CB4678', '#EB7852', '#FBB32F', '#F0F921']},
        {label: 'viridis', value: ['#440154', '#433982', '#30678D', '#218F8B', '#36B677', '#8ED542', '#FDE725']}
    ])},
    {label: 'misc', options: toOptions([
        {label: 'Cool warm', value: ['#3B4CC0', '#6F91F2', '#A9C5FC', '#DDDDDD', '#F6B69B', '#E6745B', '#B40426']},
        {label: 'Warm cool', value: ['#B40426', '#E6745B', '#F6B69B', '#DDDDDD', '#A9C5FC', '#6F91F2', '#3B4CC0']},
        {label: 'Cube helix', value: ['#000000', '#182E49', '#2B6F39', '#A07949', '#D490C6', '#C2D8F3', '#FFFFFF']},
        {label: 'Gnuplot', value: ['#000033', '#0000CC', '#5000FF', '#C729D6', '#FF758A', '#FFC23D', '#FFFF60']},
        {label: 'Jet', value: ['#00007F', '#002AFF', '#00D4FF', '#7FFF7F', '#FFD400', '#FF2A00', '#7F0000']},
        {label: 'Parula', value: ['#352A87', '#056EDE', '#089BCE', '#33B7A0', '#A3BD6A', '#F9BD3F', '#F9FB0E']},
        {label: 'Tol rainbow', value: ['#781C81', '#3F60AE', '#539EB6', '#6DB388', '#CAB843', '#E78532', '#D92120']},
        {label: 'Cividis', value: ['#00204C', '#213D6B', '#555B6C', '#7B7A77', '#A59C74', '#D3C064', '#FFE945']},
        {label: 'Blue fluorite', value: ['#291b32', '#622271', '#8f3b9c', '#9275b4', '#8ca9cc', '#98d6de', '#f1f3ee']},
        {label: 'Water', value: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b']},
        {label: 'Red to blue', value: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061']},
        {label: 'Hot', value: ['#000000', '#f03b20', '#ffff55', '#ffffb2', '#ffffee']},
        {label: 'White to red', value: ['#ffffff', '#ff0000']},
        {label: 'Black to red to white', value: ['#000000', '#ff0000', '#ffffff']},
        {label: 'Blue to red to white', value: ['#2171b5', '#e31a1c', '#ffffb2', '#ffffff']},
        {label: 'Blue to white to red', value: ['#2171b5', '#ffffff', '#e31a1c']},
        {label: 'Black to blue', value: ['#1a1a1a', '#4d4d4d', '#878787', '#bababa', '#e0e0e0', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061']}
    ])},
    {label: 'niccoli', options: toOptions([
        {label: 'cubicyf', value: ['#830CAB', '#7556F3', '#5590E7', '#3BBCAC', '#52D965', '#86EA50', '#CCEC5A']},
        {label: 'cubicl', value: ['#780085', '#7651EE', '#4C9ED9', '#49CF7F', '#85EB50', '#D4E35B', '#F9965B']},
        {label: 'isol', value: ['#E839E5', '#7C58FA', '#2984B9', '#0A9A4D', '#349704', '#9E7C09', '#FF3A2A']},
        {label: 'linearl', value: ['#040404', '#2C1C5D', '#114E81', '#00834B', '#37B200', '#C4CA39', '#F7ECE5']},
        {label: 'linearlhot', value: ['#060303', '#620100', '#B20022', '#DE2007', '#D78E00', '#C9CE00', '#F2F2B7']}
    ])},
]
