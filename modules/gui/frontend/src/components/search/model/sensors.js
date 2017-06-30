/**
 * @author Mino Togna
 */

var Sensors = {
    
    'LANDSAT': {
        'LANDSAT_8': {
            id       : 'LANDSAT_8',
            name     : 'Landsat 8 OLI/TIRS',
            shortName: 'L8'
        },
        
        'LANDSAT_7': {
            id       : 'LANDSAT_7',
            name     : 'Landsat 7 ETM+',
            shortName: 'L7'
        },
        
        'LANDSAT_TM': {
            id       : 'LANDSAT_TM',
            name     : 'Landsat 4-5 TM',
            shortName: 'L4-5 TM'
        }
    }
    
    , 'SENTINEL2': {
        'SENTINEL2A': {
            id       : 'SENTINEL2A',
            name     : 'SENTINEL-2A',
            shortName: 'S-2A'
        }
    }
    
}

module.exports = Sensors