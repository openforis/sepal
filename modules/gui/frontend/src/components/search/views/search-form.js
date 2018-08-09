/**
 * @author Mino Togna
 */
var EventBus = require('../../event/event-bus')
var Events = require('../../event/events')
var FormValidator = require('../../form/form-validator')
var DatePicker = require('../../date-picker/date-picker')
var SepalAois = require('../../sepal-aois/sepal-aois')
var Model = require('./../model/search-model')
var UserMV = require('../../user/user-mv')
var GoogleMapsLoader = require('google-maps')
var moment = require('moment')

var form = null
var formNotify = null
var inputName = null
var inputAoiCode = null
var autocompleteAoiCode = null
var btnDrawPolygon = null
var btnLandsat = null
var btnSentinel2 = null
var targetDate = null
var fusionTableId = null
var fusionTableColumn = null
var fusionTableColumnAutocomplete = null
var fusionTableValue = null
var fusionTableValueAutocomplete = null

var state = {}

var init = function (formSelector) {
    form = $(formSelector)
    formNotify = form.find('.form-notify')

    inputName = form.find('[name=name]')
    inputName.change(function (e) {
        state.name = inputName.val()
        EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state, {field: 'name'})
    })

    inputAoiCode = form.find('#search-form-country')
    SepalAois.loadAoiList(function (aois) {
        autocompleteAoiCode = inputAoiCode.sepalAutocomplete({
            lookup: aois
            , onChange: function (selection) {
                if (selection) {
                    FormValidator.resetFormErrors(form, formNotify)

                    setFusionTableValue(SepalAois.FT_TableID,
                        SepalAois.FT_KEY_COLUMN, selection.data,
                        SepalAois.FT_LABEL_COLUMN, selection.value,
                        true
                    )
                } else {
                    setFusionTableValue()
                }
                EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
            }
        })

        btnDrawPolygon = form.find('.btn-draw-polygon')
        btnDrawPolygon.click(function (e) {
            e.preventDefault()
            EventBus.dispatch(Events.SECTION.REDUCE)
            // EventBus.dispatch( Events.MAP.POLYGON_CLEAR )
            EventBus.dispatch(Events.MAP.POLYGON_DRAW)
        })

        fusionTableId = form.find('input[name=fusion-table-id]')
        fusionTableColumn = form.find('input[name=fusion-table-column]')
        fusionTableValue = form.find('input[name=fusion-table-value]')
        fusionTableId.change(function (e) {
            state.fusionTableId = fusionTableId.val()
            updateFusionTableColumns(state.fusionTableId)
        })

        btnLandsat = form.find('.btn-landsat')
        btnSentinel2 = form.find('.btn-sentinel2')
        var changeSensorGroup = function (e, btn) {
            e.preventDefault()
            if (!btn.hasClass('active')) {
                var value = btn.val()
                state.sensorGroup = value
                state.sensors = Object.keys(Model.getSensors(state.sensorGroup))

                setSensorGroupState(state.sensorGroup)
                EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
            }
        }
        btnLandsat.click(function (e) {
            changeSensorGroup(e, btnLandsat)
        })
        btnSentinel2.click(function (e) {
            changeSensorGroup(e, btnSentinel2)
        })

        targetDate = DatePicker.newInstance(form.find('.target-date'))
        targetDate.onChange = function (year, month, day) {
            state.targetDate = year + '-' + month + '-' + day
            EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
        }

        form.submit(submit)

    })
}

var submit = function (e) {
    e.preventDefault()

    FormValidator.resetFormErrors(form, formNotify)

    var valid = true
    var errorMsg = ''
    var date = targetDate.asMoment()

    if (!state.name || $.isEmptyString(state.name) || !/^[0-9A-Za-z][0-9A-Za-z\s_\-]+$/.test(state.name)) {
        valid = false
        errorMsg = 'Please enter a valid name, only letters, numbers, _ or - are allowed'

        FormValidator.addError(inputName)
    } else if ($.isEmptyString(state.aoiFusionTableKey) && $.isEmptyString(state.polygon)) {
        valid = false
        errorMsg = 'Please select a valid COUNTRY or DRAW A POLYGON'

        FormValidator.addError(inputAoiCode)
    } else if (!date.isValid()) {
        valid = false
        errorMsg = 'Please select a valid TARGET DATE'
    } else if (date.isAfter(moment())) {
        valid = false
        errorMsg = 'TARGET DATE cannot be later than today'
    }

    if (valid) {
        EventBus.dispatch(Events.SECTION.SEARCH.REQUEST_SCENE_AREAS, null, state)
    } else {
        FormValidator.showError(formNotify, errorMsg)
    }

}

var find = function (selector) {
    return form.find(selector)
}

var polygonDrawn = function (e, jsonPolygon, polygon) {
    if (state && state.type === Model.TYPES.MOSAIC) {
        setPolygon(jsonPolygon)
        // setPolygon(JSON.stringify(jsonPolygon))
        btnDrawPolygon.addClass('active')

        inputAoiCode.sepalAutocomplete('reset')

        EventBus.dispatch(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGE, null, state)
    }
}

var polygonClear = function (e) {
    setPolygon(null)
    btnDrawPolygon.removeClass('active')
}

var setFusionTableValue = function (fusionTable, keyColumn, key, labelColumn, label, zoom) {
    if (state && state.type === Model.TYPES.MOSAIC) {
        state.aoiFusionTable = fusionTable
        state.aoiFusionTableKeyColumn = keyColumn
        state.aoiFusionTableKey = key
        state.aoiFusionTableLabelColumn = labelColumn
        state.aoiFusionTableLabel = label

        if (key) {
            EventBus.dispatch(Events.MAP.POLYGON_CLEAR)
            EventBus.dispatch(Events.MAP.ZOOM_TO_FUSION_TABLE, null,
                state.aoiFusionTable, state.aoiFusionTableKeyColumn, state.aoiFusionTableKey, zoom)

            state.polygon = null
        } else {
            EventBus.dispatch(Events.MAP.REMOVE_AOI_LAYER)
        }
    }

}

var setPolygon = function (p) {
    if (state && state.type === Model.TYPES.MOSAIC) {
        state.polygon = p
        if (p) {
            SepalAois.resetAoi()
        }
    }
}

// model change methods
var setState = function (e, newState, params) {
    FormValidator.resetFormErrors(form, formNotify)
    state = newState

    if (state && state.type === Model.TYPES.MOSAIC) {

        if (!params || params.field !== 'name')
            inputName.val(state.name)

        if (state.aoiFusionTableKey && state.aoiFusionTableLabel) {
            inputAoiCode.val(state.aoiFusionTableLabel).data('reset-btn').enable()

            setFusionTableValue(
                state.aoiFusionTable,
                state.aoiFusionTableKeyColumn,
                state.aoiFusionTableKey,
                state.aoiFusionTableLabelColumn,
                state.aoiFusionTableLabel
            )
        } else {
            inputAoiCode.sepalAutocomplete('reset')
            setFusionTableValue()
        }

        if (state.polygon) {
            inputAoiCode.sepalAutocomplete('reset')
            setPolygon(state.polygon)
            btnDrawPolygon.addClass('active')

            if (params && params.isNew)
                EventBus.dispatch(Events.SECTION.SEARCH.STATE.RESTORE_DRAWN_AOI, null, state.polygon)
        } else {
            btnDrawPolygon.removeClass('active')
        }

        fusionTableId.val(newState.fusionTableId)
        updateFusionTableColumns(newState.fusionTableId, function () {
            if (newState.fusionTableColumn)
                fusionTableColumn.val(newState.fusionTableColumn).data('reset-btn').enable()
        })
        updateFusionTableValues(newState.fusionTableId, newState.fusionTableColumn, function () {
            if (newState.fusionTableValue)
                fusionTableValue.val(newState.fusionTableValue).data('reset-btn').enable()
        })

        var date = moment(state.targetDate)
        setTimeout(function () {
            targetDate.triggerChange = false
            targetDate.select('year', date.format('YYYY'))
            targetDate.select('month', date.format('MM'))
            targetDate.select('day', date.format('DD'))
            targetDate.triggerChange = true
        }, 400)

        setSensorGroupState(state.sensorGroup)
    }
    // else {
    //   EventBus.dispatch(Events.MAP.POLYGON_CLEAR)
    //   EventBus.dispatch(Events.MAP.REMOVE_AOI_LAYER)
    // }
}
EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_CHANGED, setState)

var setSensorGroupState = function (sensorGroup) {
    form.find('.btn-sensor-group').removeClass('active')
    form.find('.btn-sensor-group[value=' + sensorGroup + ']').addClass('active')
}

var updateFusionTableColumns = function (ftId, callback) {
    if (fusionTableColumnAutocomplete) {
        fusionTableColumnAutocomplete.sepalAutocomplete('dispose')
    }
    if (fusionTableValueAutocomplete) {
        fusionTableValueAutocomplete.sepalAutocomplete('dispose')
    }

    fusionTableColumn.disable()
    fusionTableValue.disable()
    if (ftId) {
        var user = UserMV.getCurrentUser()
        var keyParam = user.googleTokens ? 'access_token=' + user.googleTokens.accessToken : 'key=' + GoogleMapsLoader.KEY

        var params = {
            url: 'https://www.googleapis.com/fusiontables/v2/tables/' + ftId + '/columns?' + keyParam,
            success: function (resp) {
                FormValidator.resetFormErrors(form)
                var columns = resp.items
                var locationColumns = columns.filter(function (column) {
                    return column.type === 'LOCATION'
                })
                if (locationColumns.length !== 1) {
                    FormValidator.addError(fusionTableId)
                    FormValidator.showError(formNotify, 'Fusion Table must have exactly one Location column.')
                    return
                }
                fusionTableColumnAutocomplete = fusionTableColumn.sepalAutocomplete({
                    lookup: columns
                        .map(function (item) {
                            return {data: item.name, value: item.name}
                        }),
                    onChange: function (selection) {
                        state.fusionTableColumn = selection ? selection.data : null
                        updateFusionTableValues(ftId, state.fusionTableColumn)
                    }
                })

                fusionTableColumn.enable()
                if (callback)
                    callback()
            }, error: function (xhr, ajaxOptions, thrownError) {
                FormValidator.addError(fusionTableId)
                FormValidator.showError(formNotify, xhr.responseJSON.error.message)
            }
        }
        EventBus.dispatch(Events.AJAX.GET, null, params)
    }
}

var updateFusionTableValues = function (ftId, column, callback) {
    if (fusionTableValueAutocomplete)
        fusionTableValueAutocomplete.sepalAutocomplete('dispose')

    fusionTableValue.disable()
    if (ftId && column) {
        var user = UserMV.getCurrentUser()
        var keyParam = user.googleTokens ? 'access_token=' + user.googleTokens.accessToken : 'key=' + GoogleMapsLoader.KEY

        var params = {
            url: 'https://www.googleapis.com/fusiontables/v2/query?sql=SELECT \'' + column + '\' FROM ' + ftId
                + ' ORDER BY \'' + column + '\'&' + keyParam,
            success: function (resp) {
                FormValidator.resetFormErrors(form)

                fusionTableValueAutocomplete = fusionTableValue.sepalAutocomplete({
                    lookup: resp.rows.map(function (row) {
                        return {data: row[0], value: row[0]}
                    }),
                    onChange: function (selection) {
                        state.fusionTableValue = selection ? selection.data : null
                        if (selection) {
                            FormValidator.resetFormErrors(form, formNotify)
                            setFusionTableValue(ftId, column, selection.data, column, selection.data, true)
                        } else {
                            setFusionTableValue()
                        }
                    }
                })

                fusionTableValue.enable()
                if (callback)
                    callback()
            }, error: function (xhr, ajaxOptions, thrownError) {
                FormValidator.addError(fusionTableId)
                FormValidator.showError(formNotify, xhr.responseJSON.error.message)
            }
        }
        EventBus.dispatch(Events.AJAX.GET, null, params)
    }
}

module.exports = {
    init: init
    , find: find

}

EventBus.addEventListener(Events.MAP.POLYGON_DRAWN, polygonDrawn)
EventBus.addEventListener(Events.MAP.POLYGON_CLEAR, polygonClear)