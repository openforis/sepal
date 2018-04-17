/**
 * @author Mino Togna
 */

var EventBus         = require('../event/event-bus')
var Events           = require('../event/events')
var GoogleMapsLoader = require('google-maps')

var FT_URL        = 'https://www.googleapis.com/fusiontables/v2/query'
var FT_TableID    = '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F'
var FT_KEY_COLUMN = 'ISO'
var FT_LABEL_COLUMN = 'NAME_FAO'

var loadAoiList = function (fusionTableOrCallback, keyColumn, labelColumn, callback) {
  var fusionTable = fusionTableOrCallback
  if (!keyColumn) {
    fusionTable = FT_TableID
    keyColumn = FT_KEY_COLUMN
    labelColumn = FT_LABEL_COLUMN
    callback = fusionTableOrCallback
  }
  var query = [
      'SELECT', keyColumn, ',', labelColumn,
      'FROM', fusionTable,
      'WHERE', labelColumn, 'NOT EQUAL TO \'\'',
      'ORDER BY', labelColumn].join(' ')
  var data  = {sql: query, key: GoogleMapsLoader.KEY}
  
  var params = {
    url      : FT_URL
    , data   : data
    , success: function (response) {
      var aois = []
      $.each(response.rows, function (i, row) {
        aois.push({data: row[0], value: row[1]})
      })
      
      callback(aois)
    }
  }
  EventBus.dispatch(Events.AJAX.GET, null, params)
}

var migrateAoi = function (state) {
    if (state.aoiCode && state.aoiName) {
        state.aoiFusionTable = FT_TableID
        state.aoiFusionTableKeyColumn = FT_KEY_COLUMN
        state.aoiFusionTableKey = state.aoiCode
        state.aoiFusionTableLabelColumn = FT_LABEL_COLUMN
        state.aoiFusionTableLabel = state.aoiName
    }
}

var resetAoi = function (state) {
    if (!state)
      return
    state.aoiFusionTable = null
    state.aoiFusionTableKeyColumn = null
    state.aoiFusionTableKey = null
    state.aoiFusionTableLabelColumn = null
    state.aoiFusionTableLabel = null
}

var getFusionTableLayer = function (fusionTable, column, value) {
  var FT_Options = {
    suppressInfoWindows: true,
    query              : {
      from  : fusionTable,
      select: 'geometry',
      where : '\'' + column + '\' = \'' + value + '\';'
    },
    styles             : [{
      polygonOptions: {
        fillColor    : '#FBFAF2',
        fillOpacity  : 0.07,
        strokeColor  : '#FBFAF2',
        strokeOpacity: 0.15,
        strokeWeight : 1
      }
    }]
  }

  return new google.maps.FusionTablesLayer(FT_Options)
}

var loadBounds = function (fusionTable, column, value, callback) {
  var query = 'SELECT geometry FROM ' + fusionTable + ' WHERE ' + column + ' = \'' + value + '\''
  var data  = {sql: query, key: GoogleMapsLoader.KEY}
  
  var bounds    = new google.maps.LatLngBounds()
  var addBounds = function (geometry) {
    $.each(geometry.coordinates, function (k, latLngs) {
      $.each(latLngs, function (l, latLng) {
        var gLatLng = new google.maps.LatLng(Number(latLng[1]), Number(latLng[0]))
        bounds.extend(gLatLng)
      })
    })
  }
  
  var params = {
    url      : FT_URL
    , data   : data
    , success: function (response) {
      var geometryCollections = response.rows[0]
      $.each(geometryCollections, function (i, geometryCollection) {
        
        if (geometryCollection.geometries) {
          $.each(geometryCollection.geometries, function (j, geometry) {
            addBounds(geometry)
          })
        } else if (geometryCollection.geometry) {
          addBounds(geometryCollection.geometry)
        }
        
      })
      
      callback(bounds)
    }
  }
  EventBus.dispatch(Events.AJAX.GET, null, params)
}

module.exports = {
  loadAoiList          : loadAoiList
  , getFusionTableLayer: getFusionTableLayer
  , loadBounds         : loadBounds
  , getTableName       : function () {
    return FT_TableID
  }
  , getKeyColumn       : function () {
    return FT_KEY_COLUMN
  }
  , migrateAoi : migrateAoi
  , resetAoi: resetAoi
  , FT_TableID : FT_TableID
  , FT_KEY_COLUMN: FT_KEY_COLUMN
  , FT_LABEL_COLUMN: FT_LABEL_COLUMN
}