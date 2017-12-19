/**
 * @author Mino Togna
 */

var Sensors = {
  
  'LANDSAT': {
    'LANDSAT_8': {
      id                : 'LANDSAT_8',
      name              : 'Landsat 8',
      shortName         : 'L8',
      selected          : true,
      surfaceReflectance: true,
      bands             : [
        'aerosol',
        'blue',
        'green',
        'red',
        'nir',
        'swir1',
        'swir2',
        'pan',
        'cirrus',
        'thermal',
        'thermal2'
      ]
    },
    
    'LANDSAT_7': {
      id                : 'LANDSAT_7',
      name              : 'Landsat 7',
      shortName         : 'L7',
      selected          : true,
      surfaceReflectance: true,
      bands             : [
        'blue',
        'green',
        'red',
        'nir',
        'swir1',
        'thermal',
        'thermal2',
        'swir2',
        'pan'
      ]
    },
    
    'LANDSAT_TM': {
      id                : 'LANDSAT_TM',
      name              : 'Landsat 4-5',
      shortName         : 'L4-5',
      selected          : true,
      surfaceReflectance: false,
      bands             : [
        'blue',
        'green',
        'red',
        'nir',
        'swir1',
        'thermal',
        'swir2'
      ]
    },
    
    'LANDSAT_8_T2': {
      id                : 'LANDSAT_8_T2',
      name              : 'Landsat 8 Tier 2',
      shortName         : 'L8 T2',
      selected          : false,
      surfaceReflectance: true,
      bands             : [
        'aerosol',
        'blue',
        'green',
        'red',
        'nir',
        'swir1',
        'swir2',
        'pan',
        'cirrus',
        'thermal',
        'thermal2'
      ]
    },
    
    'LANDSAT_7_T2': {
      id                : 'LANDSAT_7_T2',
      name              : 'Landsat 7 Tier 2',
      shortName         : 'L7 T2',
      selected          : false,
      surfaceReflectance: true,
      bands             : [
        'blue',
        'green',
        'red',
        'nir',
        'swir1',
        'thermal',
        'thermal2',
        'swir2',
        'pan'
      ]
    },
    
    'LANDSAT_TM_T2': {
      id                : 'LANDSAT_TM_T2',
      name              : 'Landsat 4-5 Tier 2',
      shortName         : 'L5 T2',
      selected          : false,
      surfaceReflectance: false,
      bands             : [
        'blue',
        'green',
        'red',
        'nir',
        'swir1',
        'thermal',
        'swir2'
      ]
    }
  }
  
  , 'SENTINEL2': {
    'SENTINEL2A': {
      id                : 'SENTINEL2A',
      name              : 'SENTINEL-2A',
      shortName         : 'S-2A',
      selected          : true,
      surfaceReflectance: false,
      bands             : [
        'aerosol',
        'blue',
        'green',
        'red',
        'redEdge1',
        'redEdge2',
        'redEdge3',
        'nir',
        'redEdge4',
        'waterVapor',
        'cirrus',
        'swir1',
        'swir2'
      ]
    }
  }
  
}

module.exports = Sensors