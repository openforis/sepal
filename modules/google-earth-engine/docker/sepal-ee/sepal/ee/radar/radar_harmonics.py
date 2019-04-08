import math

import ee

def calculate(collection, band, harmonics=1):
    #######################################/
    # Function that performs a harmonic time series analysis of an image 
    # collection for a dependent variable and returns a multi-band image of the  
    # harmonic coefficients and RMSE.

    # Make a list of harmonic frequencies to model.  
    # These also serve as band name suffixes.
    dependent = band
    harmonicFrequencies = range(harmonics)
    harmonicSeq = ee.List.sequence(1, harmonics)

    # Function to get a sequence of band names for harmonic terms.

    def to_stack(collection):
        def stacking(img, prev):
            return ee.Image(prev).addBands(img);

        stack = ee.Image(collection.iterate(stacking, ee.Image(1)))
        stack = stack.select(ee.List.sequence(1, stack.bandNames().size().subtract(1)));

        return stack

    def getNames(base, myList):
        names = []
        for i in myList:
            names.append(base + str(i + 1))
        return names

    # Construct lists of names for the harmonic terms.
    cosNames = getNames('cos_', harmonicFrequencies)
    sinNames = getNames('sin_', harmonicFrequencies)
    amplitudeNames = getNames('amplitude_', harmonicFrequencies)
    phaseNames = getNames('phase_', harmonicFrequencies)

    # Independent variables.
    independents = ee.List(['constant', 't']).cat(cosNames).cat(sinNames)

    def addConstant(image):
        return image.addBands(ee.Image(1))

    # Function to add a time band.
    def addTime(image):
        # Compute time in fractional years since the epoch.
        date = ee.Date(image.get('system:time_start'))
        years = date.difference(ee.Date('1970-01-01'), 'year')
        timeRadians = ee.Image(years.multiply(2 * math.pi))
        return image.addBands(timeRadians.rename('t').float())

    # Function to compute the specified number of harmonics    
    # and add them as bands.  Assumes the time band is present.
    def addHarmonics(image):

        def getImg(freqs):
            # Make an image of frequencies.
            frequencies = ee.Image.constant(freqs)
            # This band should represent time in radians.
            time = ee.Image(image).select('t')
            # Get the cosine terms.
            cosines = time.multiply(frequencies).cos().rename(cosNames)
            # Get the sin terms.
            sines = time.multiply(frequencies).sin().rename(sinNames)
            return ee.Image(image.addBands(cosines).addBands(sines))

        for i in harmonicFrequencies:
            image = getImg(i)

        return image

    # Compute phase and amplitude
    def getPhaseAmp(harmonic):
        harmonicString = str(harmonic)
        cosName_i = ee.String('cos_').cat(harmonicString)
        sinName_i = ee.String('sin_').cat(harmonicString)
        phaseName_i = ee.String('phase_').cat(harmonicString)
        amplitudeName_i = ee.String('amplitude_').cat(harmonicString)
        phase = harmonicTrendCoefficients.select(cosName_i).atan2(harmonicTrendCoefficients.select(sinName_i))
        phase = phase.rename(phaseName_i)

        amplitude = harmonicTrendCoefficients.select(cosName_i).hypot(harmonicTrendCoefficients.select(sinName_i))
        amplitude = amplitude.rename(amplitudeName_i)
        out = phase.addBands(amplitude)
        return out

    # Add constants, time, and harmonics to image
    harmonicImages = collection.map(addConstant).map(addTime).map(addHarmonics)

    # The output of the regression reduction is a 4x1 array image.
    harmonicTrend = harmonicImages.select(
        independents.add(dependent)).reduce(ee.Reducer.linearRegression(independents.length(), 1)
    )
    
    minMax = harmonicTrend.reduceRegion(
        reducer=ee.Reducer.minMax(),
        geometry=ee.Image(collection.first()).geometry(),
        scale=100000,
        maxPixels=1e10
    )
    print(minMax.getInfo())
    
    # Turn the array image into a multi-band image of coefficients.
    harmonicTrendCoefficients = harmonicTrend.select('coefficients').arrayProject([0]).arrayFlatten([independents])
    harmonicTrendResiduals = harmonicTrend.select('residuals').arrayGet(0).rename('RMSE')

    out = harmonicTrendCoefficients.select(['constant', 't'])

#         phaseAmplitude = ee.ImageCollection([getPhaseAmp(harmonic + 1) for harmonic in harmonicFrequencies])

#         out = out.addBands(to_stack(phaseAmplitude))
    out = out.addBands(harmonicTrendResiduals)
    return out
    
    