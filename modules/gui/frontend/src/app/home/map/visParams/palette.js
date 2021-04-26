import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Combo} from 'widget/combo'
import {Input} from 'widget/input'
import {Layout} from 'widget/layout'
import {Widget} from 'widget/widget'
import Color from 'color'
import Label from 'widget/label'
import React from 'react'
import Tooltip from 'widget/tooltip'
import guid from 'guid'
import styles from './palette.module.css'

export class Palette extends React.Component {
    state = {
        text: null,
        edit: null,
        show: 'palette'
    }

    render() {
        const {className} = this.props
        return (
            <Widget
                label={'Palette'}
                labelButtons={this.labelButtons()}
                layout={'vertical'}
                className={className}>
                <Layout className={styles.paletteRow}>
                    {this.renderPalette()}
                    {this.renderText()}
                </Layout>
                {this.renderPresets()}
            </Widget>
        )
    }

    renderPresets() {
        const toOptions = options => options.map(({label, value}) => ({
            label, value, render: () => {
                return (
                    <div
                        className={styles.presetOption}
                        style={{'--palette': value.join(', ')}}>
                        <Label msg={label} className={styles.presetLabel}/>
                    </div>
                )
            }
        }))
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
                {label: 'berin', value: ['#9EB0FF', '#5BA4DB', '#2D7597', '#1A4256', '#11191E', '#280D01', '#501803', '#8A3F2A', '#C4756A', '#FFADAD']},
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
        return (
            <Combo
                className={styles.preset}
                placeholder={'Select a pre-set palette...'}
                options={options}
                onChange={({value}) => this.applyPreset(value)}
            />
        )
    }

    renderText() {
        const {show, text} = this.state
        if (show !== 'text') {
            return null
        }
        return (
            <Input
                className={styles.widget}
                value={text || ''}
                onChange={({target: {value}}) => this.updateText(value)}
            />
        )
    }

    renderPalette() {
        const {edit, show} = this.state
        if (show !== 'palette') {
            return null
        }
        const {input} = this.props
        const colorInputs = (input.value || []).map(({color, id}, i) =>
            <ColorInput
                key={id}
                color={color}
                onInsert={() => this.insertColor(i)}
                onRemove={() => this.removeColor(id)}
                onBlur={() => {
                    this.setState({edit: null})
                }}
                onChange={color => {
                    this.updateColor(color, id)
                }}
                onEdit={() => this.setState({edit: id})}
                edit={!!edit}
            />
        )
        return (
            <div className={styles.palette}>
                {colorInputs}
            </div>
        )
    }

    labelButtons() {
        const {show} = this.state
        return [
            <Button
                key={'add'}
                icon='plus'
                chromeless
                shape='circle'
                size='small'
                onClick={() => this.addColor()}
            />,
            show === 'palette'
                ? (
                    <Button
                        key={'text'}
                        icon='hashtag'
                        chromeless
                        shape='circle'
                        size='small'
                        onClick={() => this.show('text')}
                    />
                )
                : (
                    <Button
                        key={'palette'}
                        icon='palette'
                        chromeless
                        shape='circle'
                        size='small'
                        onClick={() => this.show('palette')}
                    />
                )
        ]
    }

    show(value) {
        this.setState({show: value})
    }

    createColor(color, edit) {
        return {
            id: guid(),
            color,
            edit,
        }
    }

    addColor() {
        const {input} = this.props
        const palette = input.value || []
        const color = this.createColor('#000000')
        this.setColors([...palette, color])
        this.setState({edit: color.id})
    }

    insertColor(index) {
        const {input} = this.props
        const palette = input.value || []
        const color = this.createColor('#000000')
        this.setColors([...palette.slice(0, index), color, ...palette.slice(index)])
        this.setState({edit: color.id})
    }

    removeColor(idToRemove) {
        const {input} = this.props
        const palette = input.value || []
        this.setColors(palette.filter(({id}) => id !== idToRemove))
    }

    updateColor(color, idToUpdate) {
        const {input} = this.props
        const palette = input.value || []
        this.setColors(
            palette.map(colorEntry => ({
                ...colorEntry,
                color: colorEntry.id === idToUpdate ? color : colorEntry.color
            }))
        )
        this.setState({edit: null})
    }

    setColors(colors) {
        const {input} = this.props
        input.set(colors)
        const text = colors
            .map(({color}) => color)
            .join(', ')
        this.setState({text})
    }

    applyPreset(colors) {
        this.setColors(colors.map(color => this.createColor(color)))
    }

    updateText(value) {
        const {input} = this.props
        this.setState({text: value})
        if (value) {
            const colors = value
                .split(',')
                .map(color => {
                    try {
                        return this.createColor(Color(color.trim()).hex())
                    } catch(_error) {
                        return null // Malformatted color
                    }
                })
                .filter(color => color)
            input.set(colors)
        } else {
            input.set([])
        }
    }
}

class ColorInput extends React.Component {
    element = null

    constructor(props) {
        super(props)
        this.initRef = this.initRef.bind(this)
    }

    render() {
        const {color, onBlur, onChange} = this.props
        return (
            <Tooltip
                msg={this.renderColorButtons()}
                delay={0}
                placement={'bottom'}>
                <div className={styles.colorContainer}>
                    <div
                        className={styles.color}
                        style={{'--color': Color(color).hex()}}
                    />
                    <input
                        type='color'
                        className={styles.colorInput}
                        value={Color(color).hex()}
                        onChange={({target: {value}}) => onChange(value)}
                        onBlur={() => onBlur()}
                        ref={this.initRef}
                    />
                </div>
            </Tooltip>
        )
    }

    renderColorButtons() {
        const {onEdit, onInsert, onRemove} = this.props
        return (
            <ButtonGroup layouy='horizontal-nowrap'>
                <Button
                    icon='plus'
                    chromeless
                    shape='circle'
                    size='small'
                    onClick={() => onInsert()}
                />
                <Button
                    icon='pen'
                    chromeless
                    shape='circle'
                    size='small'
                    onClick={() => {
                        onEdit()
                        this.element.click()
                    }}
                />
                <Button
                    icon='trash'
                    chromeless
                    shape='circle'
                    size='small'
                    onClick={() => onRemove()}
                />
            </ButtonGroup>)
    }

    initRef(element) {
        this.element = element
        const {edit} = this.props
        if (edit) {
            setTimeout(
                () => this.element && this.element.click()
            )
        }
    }
}
