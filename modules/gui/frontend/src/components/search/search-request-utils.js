/**
 * @author Mino Togna
 */
var moment = require( 'moment' )

var addAoiRequestParameter = function ( state, data ) {
  if ( data ) {
    
    if ( $.isNotEmptyString( state.polygon ) ) {
      data.polygon = state.polygon
    } else if ( $.isNotEmptyString( state.aoiCode ) ) {
      data.countryIso = state.aoiCode
    }
    
  }
}

var addDatesRequestParameters = function ( state, data ) {
  var DATE_FORMAT = "YYYY-MM-DD"
  var date        = moment( state.targetDate )
  
  if ( state.offsetToTargetDay === 0 ) {
    data.fromDate = date.clone().month( 0 ).date( 1 ).format( DATE_FORMAT )
    data.toDate   = date.clone().month( 11 ).date( 31 ).format( DATE_FORMAT )
  } else {
    data.fromDate = date.clone().subtract( state.offsetToTargetDay / 2, 'years' ).format( DATE_FORMAT )
    data.toDate   = date.clone().add( state.offsetToTargetDay / 2, 'years' ).format( DATE_FORMAT )
  }
  
  addTargetDayOfYearRequestParameter( state, data )
}

var addTargetDayOfYearRequestParameter = function ( state, data ) {
  var date             = moment( state.targetDate )
  data.targetDayOfYear = date.format( "DDD" )
}

var addSensorIds = function ( state, data ) {
  if ( state.sensors ) {
    data.sensorIds = state.sensors.join( ',' )
  }
}

var addSceneAreaIds = function ( state, data ) {
  if ( state.sceneAreas ) {
    data.sceneAreaIds = Object.keys( state.sceneAreas ).join( "," )
  }
}

var addSceneIds = function ( state, data ) {
  var sceneIds  = getSceneIds( state )
  data.sceneIds = sceneIds.join( ',' )
  return sceneIds
}

var getSceneIds = function ( state ) {
  var sceneIds = []
  if ( state.sceneAreas )
    $.each( state.sceneAreas, function ( i, sceneArea ) {
      Array.prototype.push.apply( sceneIds, sceneArea.selection )
    } )
  return sceneIds
}

var getImageData = function ( state, bands ) {
  var aoi
  if ( $.isNotEmptyString( state.polygon ) )
    aoi = {
      type: 'polygon',
      path: JSON.parse( state.polygon )
    }
  else
    aoi = {
      type     : 'fusionTable',
      tableName: '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F',
      keyColumn: 'ISO',
      keyValue : state.aoiCode
    }
  
  return {
    aoi                  : aoi,
    targetDayOfYear      : moment( state.targetDate ).format( "DDD" ),
    targetDayOfYearWeight: state.mosaicTargetDayWeight,
    shadowTolerance      : state.mosaicShadowTolerance,
    hazeTolerance        : state.mosaicHazeTolerance,
    greennessWeight      : state.mosaicGreennessWeight,
    dataSet              : state.sensorGroup,
    bands                : bands.split( ',' ).map( function ( band ) { return band.trim() } ),
    medianComposite      : state.median,
    brdfCorrect          : state.brdfCorrect,
    maskClouds           : state.maskClouds,
    maskSnow             : state.maskSnow,
    sceneIds             : getSceneIds( state ),
    type                 : 'manual'
  }
}

module.exports = {
  addAoiRequestParameter              : addAoiRequestParameter
  , addDatesRequestParameters         : addDatesRequestParameters
  , addTargetDayOfYearRequestParameter: addTargetDayOfYearRequestParameter
  , addSensorIds                      : addSensorIds
  , addSceneAreaIds                   : addSceneAreaIds
  , addSceneIds                       : addSceneIds
  , getImageData                      : getImageData
}