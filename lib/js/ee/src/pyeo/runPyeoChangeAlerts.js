import ee from '#sepal/ee/ee'
/**
 * PyEO Change Alerts — GEE function.
 *
 * The input parameters and output band spec below are the contract between
 * UoL and SEPAL.
 *
 * This function does not classify. It receives baseline and monitoring
 * inputs that already carry a 'class' band; the SEPAL recipe wrapper
 * applies the user's classification recipe before calling in.
 *
 * @param {Object} params
 * @param {ee.Geometry|ee.FeatureCollection} params.aoi
 *     Area of interest. Output should be clipped to this.
 * @param {ee.Image} params.classifiedBaseline
 *     Baseline classification map with a 'class' band (integer class IDs).
 *     If params.indexGate is set, must also carry the gate index band
 *     (`gate_index`).
 * @param {ee.ImageCollection} params.classifiedMonitoringCollection
 *     Monitoring images, time-sorted (system:time_start ascending). Each
 *     image carries the same 'class' band (and optional gate band) as the
 *     baseline.
 * @param {number[]} params.changeFromClasses
 *     Class IDs that, in the BASELINE, count as the "from" side of a change.
 * @param {number[]} params.changeToClasses
 *     Class IDs that, in any MONITORING image, count as the "to" side.
 * @param {number} [params.minConsecutiveDetections=2]
 *     Temporal-confidence parameter. Interpretation up to the algorithm.
 * @param {{use: boolean, index: string, threshold: number, minRequiredDeltaIndexDetectionsThreshold: number}} [params.indexGate]
 *
 * @returns {ee.Image} Multi-band change report raster, clipped to AOI. Required bands:
 *     availableImageCount,
 *     occludedCount,
 *     classChangeDetectionCount,
 *     firstChangeDateAboveThreshold,
 *     postFCDChangeCount,
 *     postFCDNoChangeCount,
 *     postFCDOccludedCount,
 *     postFCDValidImageCount,
 *     postFCDChangeDetectionRepeatability,
 *     binaryTimeSeriesDecisionMasked,
 *     FCDDecisionMap,
 *     deltaIndexChangeDetectionCount,
 *     binaryDeltaIndexDecisionMap,
 *     binaryDeltaClassDecisionMap,
 *     binaryCombinedDeltaDecisionMap,
 *     fromClassCount,
 *     toClassCount,
 *     binaryDecisionFromToMap
 *
 *     Pixels with no alert should be masked out. The output band names are
 *     part of the contract — SEPAL's wrapper references them. If the
 *     algorithm needs a different schema, flag it so we update both sides.
 *
 *     Keep the body server-side. Use .map() / .iterate() / ee.Algorithms.If.
 *     Avoid .getInfo() and JS for-loops over ee.List — they fail at scale.
 */
 // 
 // potential inputs: index-gate boolean (on/off), index threshold
 //
export const runPyeoChangeAlerts = params => {
  // ==============================================================================
  // 1. INPUT PARAMETERS
  // ==============================================================================
  var aoi = params.aoi
  var classifiedBaseline = params.classifiedBaseline
  var classifiedMonitoringCollection = params.classifiedMonitoringCollection
  var changeFromClasses = params.changeFromClasses
  var changeToClasses = params.changeToClasses
  var minRequiredValidatedDetectionsThreshold = params.minRequiredValidatedDetectionsThreshold || 2
  var minRequiredClassifierDetectionsThreshold = params.minRequiredClassifierDetectionsThreshold || 5
  var percentageProbabilityThreshold = params.percentageProbabilityThreshold || 50
  var minRequiredFromDetectionsThreshold = params.minRequiredFromDetectionsThreshold || 2
  var minRequiredToDetectionsThreshold = params.minRequiredToDetectionsThreshold || 2
  var indexGate = params.indexGate || {use: false, index: 'ndvi', threshold: 0.2, minRequiredDeltaIndexDetectionsThreshold: 5}

  // ==============================================================================
  // 2. POST-CLASSIFICATION HAZE DETECTION
  // ==============================================================================

  // *********
  // haze is misclassifying scenes, impacting the timing and position of changes detected.
  // since we can't apply haze spectral detection to the source imagery, we apply detection to the
  // classification results.
  // The idea is that because haze usually causes a brightening of a scene's surface reflectance values
  // this induces misclassification e.g. was forest, now classified as grassland, despite still being forest
  // in the scene. So we calculate how much of our from classes are in the baseline, then compare this against
  // the proportion of the pixels in each change image that are from classes.
  // This is a work in progress logic, so is turned off, for now, until we can verify that there are no or low
  // likelihood of actual changes being removed
  // *********

  var baselineFromMask = classifiedBaseline
    .select("classification")
    .eq(changeFromClasses) // binary mask where baseline equals forest value
    .reduce(ee.Reducer.max()) // flattens the multiband boolean into singleband, if any from is matched
    .rename("baseline_from");

  // calculate the number of from class pixels in the baseline
  var baseline_from_count = ee.Number(baselineFromMask.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: aoi,
      scale: 10,
      maxPixels: 1e9
  }).get("baseline_from"))
  
  // 10% is the default baseline from threshold
  var fromAvailabilityRequirement = baseline_from_count.multiply(0.1)

  // function to calculate the proportion of pixels in each image of the monitoring timeseries
  var processAndFlagHaze = function(image) {
    var classification = image.select("classification");
    
    // get the position of all baseline FROM pixels within the monitoring image's valid pixels (its mask)
    var fromInMonitoringImage = baselineFromMask.updateMask(classification.mask());
  
    // identify which pixels are FROM, creating a boolean image
    var retainedFrom = classification
      .eq(changeFromClasses)
      .reduce(ee.Reducer.max()) // flattens the multiband boolean into singleband, if any from is matched
      .updateMask(fromInMonitoringImage)
      .rename("retained_from");
    
    // get the total number of pixels by summing the booleans (1s)
    var stats = ee.Image([fromInMonitoringImage, retainedFrom]).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: aoi,
      scale: 10,
      maxPixels: 1e9
    })
    
    // calculate the proportion
    var baselineFromCount = ee.Number(stats.get("baseline_from")).add(0.001); // add 0.001 to prevent divide by zero in 100% cloud masked images
    var retainedFromCount = ee.Number(stats.get("retained_from"));
    var proportion = retainedFromCount.divide(baselineFromCount);
    
    // evaluate baseline from class availability and haze conditions
    var hasEnoughBaseline = baselineFromCount.gte(fromAvailabilityRequirement);
    var isNotHazy = proportion.gt(0.3);
    var keepImage = hasEnoughBaseline.and(isNotHazy);
    
    // set as a property
    return image.set({
      "from_proportion": proportion,
      "baseline_from_count": baselineFromCount,
      "retained_from_count": retainedFromCount,
      "keep_image": keepImage
    })
  };

  // baseline_from_count = in a monitoring image, the number of pixels that were a from class in the baseline AND are non-cloudy
  // retained_from_count = in a monitoring image, the number of pixels that were a from class in the baseline AND non-cloudy AND are still classed as forest

  var hazeFilteredClassifiedMonitoringCollection = classifiedMonitoringCollection
    .map(processAndFlagHaze)
    .filter(ee.Filter.eq("keep_image", 1));

  // ==============================================================================
  // 3. CHANGE DETECTION LOGIC
  // ==============================================================================
  
  // get the classification band of the baseline, as may have more than one band
  var baselineClassification = classifiedBaseline.select("classification");
  
  // create a fromMask that works for multiple classes
  // this mask is used to count changes for pixels from a FROM class to a TO class
  var fromMask = ee.ImageCollection(
    changeFromClasses.map(function(classId) {
      return baselineClassification.eq(classId)
    })
    ).max(); // max() works as a logical OR across the imagecollection

  
  // *********
  // here we implement a simple if else for whether a spectral index will be used for the workflow,
  // aspects of the change detection logic are repeated, but it is clearer for a developer to understand
  // the logic
  // *********

  // =========================
  // 3A. BRANCH: IF A SPECTRAL INDEX IS SUPPLIED
  // =========================

if (indexGate.use) {
        
    var baselineIndex = classifiedBaseline.select(indexGate.index)
  
    // =================
    // FUNCTION TO IDENTIFY IF ANY CHANGES HAVE OCCURRED
    // =================
    
    // we define the function at the same time as using .map to iterate our function across the timeseries
    var changeEvents = hazeFilteredClassifiedMonitoringCollection.map(function(image) {
      var currentClass = image.select("classification");
      var currentIndex = image.select(indexGate.index);
  
      // ************
      // for each image, identify where pixels are a FROM class in the monitoring collection
      // this describes the consistency of each pixel as a FROM class
      var isFromClass = ee.ImageCollection(
        changeFromClasses.map(function(classId) {
          return currentClass.eq(classId);
        })
      ).max().rename("is_from_class");
      // ************
  
      // ************
      // for each image, identify where pixels are a TO class in the monitoring collection
      // this describes the consistency of each pixel as a TO class
      var isToClass = ee.ImageCollection(
        changeToClasses.map(function(classId) {
          return currentClass.eq(classId);
        })
      ).max().rename("is_to_class");
      // ************
  
      // identify which pixels have changed to ChangeToClasses
      var transitionMask = fromMask.and(isToClass).rename("transition_mask"); // using a mask allows for .and to work
        
      // calculate the delta (change) between the baseline index and the current image index
      // then whether the delta index is greater than the minimum threshold to account for natural variability
      var deltaIndex = baselineIndex.subtract(currentIndex).rename("delta_index");
      var deltaIndexThresholdedMask = deltaIndex.gte(indexGate.threshold).rename("delta_index_thresholded_mask"); // boolean of whether a pixel passed the evaluation
  
      // flag where both conditions (class and great enough index change) are met
      var isChangeMask = transitionMask.and(deltaIndexThresholdedMask).rename("is_change");
      
      // *********  
      // store the image date as fractional date band for change reporting
      var imgDate = ee.Date(image.get("system:time_start"));
      var year = imgDate.get("year");
      var fraction = imgDate.getFraction("year");
      var fractionalYear = year.add(fraction);
      var imgFracYear = ee.Image.constant(fractionalYear).double();
      // *********
  
      // build dates of all changes above the index threshold
      var changeDateAboveThreshold = imgFracYear
        .updateMask(isChangeMask)
        .rename("change_date_above_threshold");
  
    // an imagecollection, each image has the six bands above

      return image.addBands([
        isChangeMask,
        changeDateAboveThreshold,
        deltaIndexThresholdedMask,
        deltaIndex,
        isFromClass,
        isToClass,
        currentClass,
        transitionMask]);
    });

  } // END OF BRANCH
  
  // =========================
  // 3B. BRANCH: IF NO SPECTRAL INDEX IS SUPPLIED
  // =========================
  
  if (!indexGate.use) {
    
    // =================
    // FUNCTION TO IDENTIFY IF ANY CHANGES HAVE OCCURRED
    // =================
    
    // we define the function at the same time as using .map to iterate our function across the timeseries
    var changeEvents = hazeFilteredClassifiedMonitoringCollection.map(function(image) {
      var currentClass = image.select("classification");
      // var currentIndex = image.select(indexGate.index);
  
      // ************
      // for each image, identify where pixels are a FROM class in the monitoring collection
      // this describes the consistency of each pixel as a FROM class
      var isFromClass = ee.ImageCollection(
        changeFromClasses.map(function(classId) {
          return currentClass.eq(classId);
        })
      ).max().rename("is_from_class");
      // ************
  
      // ************
      // for each image, identify where pixels are a TO class in the monitoring collection
      // this describes the consistency of each pixel as a TO class
      var isToClass = ee.ImageCollection(
        changeToClasses.map(function(classId) {
          return currentClass.eq(classId);
        })
      ).max().rename("is_to_class");
      // ************
  
      // identify which pixels have changed to ChangeToClasses
      var transitionMask = fromMask.and(isToClass).rename("transition_mask"); // using a mask allows for .and to work
        
      // calculate the delta (change) between the baseline index and the current image index
      // then whether the delta index is greater than the minimum threshold to account for natural variability
      // var deltaIndex = baselineIndex.subtract(currentIndex).rename("delta_index");
      // var deltaIndexThresholdedMask = deltaIndex.gte(indexGate.threshold).rename("delta_index_thresholded_mask"); // boolean of whether a pixel passed the evaluation
  
      // flag where both conditions (class and great enough index change) are met
      var isChangeMask = transitionMask.rename("is_change");
      
      // *********  
      // store the image date as fractional date band for change reporting
      var imgDate = ee.Date(image.get("system:time_start"));
      var year = imgDate.get("year");
      var fraction = imgDate.getFraction("year");
      var fractionalYear = year.add(fraction);
      var imgFracYear = ee.Image.constant(fractionalYear).double();
      // *********
  
      // build dates of all changes above the index threshold
      var changeDateAboveThreshold = imgFracYear
        .updateMask(isChangeMask)
        .rename("change_date_above_threshold");
  
    // an imagecollection, each image has the six bands above

      return image.addBands([
        isChangeMask,
        changeDateAboveThreshold,
        // deltaIndexThresholdedMask,
        // deltaIndex,
        isFromClass,
        isToClass,
        currentClass,
        transitionMask
        ]);
    });
  } 
  
  // ==============================================================================
  // 4. LOGIC TO UNDERSTAND THE CONSISTENCY OF CHANGE
  // ==============================================================================

  // get the first change date per pixel
  var firstChangeDateAboveThreshold = changeEvents
    .select("change_date_above_threshold")
    .min()
    .rename("first_change_date_above_threshold");

  // we define the function at the same time as using .map to iterate our function across the timeseries
  // map over the change images in changeEvents a second time, to evaluate the temporal consistency of the first changes
  var postChangeEvaluation = changeEvents.map(function(image) {
    
    // *********  
    // store the image date as fractional date band for change reporting
    var imgDate = ee.Date(image.get("system:time_start"));
    var year = imgDate.get("year");
    var fraction = imgDate.getFraction("year");
    var fractionalYear = year.add(fraction);
    var imgFracYear = ee.Image.constant(fractionalYear).double();
    // *********
    
    // create a temporal window mask
    // pixel has a value of 1 if it has a change that is the first change or is afterwards
    var isAfterFirstChange = imgFracYear.gte(firstChangeDateAboveThreshold);

    var isPostFCD = isAfterFirstChange.rename("post_fcd"); // boolean (1, 0) indicating whether the pixel is post-FCD
    var isChange = image.select("is_change") // 1 for change, 0 for no change
    // here find out if masked, then unmasked and eq
    var isOccluded = image.select("classification").mask().not();
    
    // combine first change date with whether was occluded
    // we unmask isAfterFirstChange to 0. If a pixel never had a first change, it cannot have post-FCD occlusions,
    // so we force it to 0 instead of leaving it masked
    var isPostFCDOccluded = isOccluded.and(isAfterFirstChange.unmask(0)).rename("post_fcd_occluded");

    // a pixel had a change after after FCD
    var subsequentChange = isChange.and(isAfterFirstChange).rename("post_fcd_change")

    // a pixel did not have a new change after a FCD
    var isNotChange = isChange.not(); // turns 0s (no change) to 1s and vice versa - 1s (change) to 0s
    var subsequentNonChange = isNotChange.and(isAfterFirstChange).rename("post_fcd_nochange");

    // return an imagecollection of images with two bands each, of subsquent change and non-change
    return image.addBands([
      subsequentChange,
      subsequentNonChange,
      isPostFCD,
      isPostFCDOccluded
      ]);
  });
  
  // ==============================================================================
  // 5. COMPILING THE CHANGE REPORT LAYERS
  // ==============================================================================

  // =========================
  // 5A. BRANCH: IF A SPECTRAL INDEX IS SUPPLIED
  // =========================
  
  if (indexGate.use) {
    
    // LAYER 0: count the number of images within the collection
    var availableImageCount = ee.Image(hazeFilteredClassifiedMonitoringCollection.size())
      .clip(aoi)
      .rename("available_image_count");
      
    // LAYER 1: count the number of occluded images per pixel
    var occludedCount = hazeFilteredClassifiedMonitoringCollection.map(function(image) {
      var isOccluded = image.select("classification").mask().unmask(0).eq(0);
      // .mask() returns a 1 for valid pixels and is masked for cloudy pixels
      // unmask(0) converts these cloudy pixels to 0, but it also respects the image footprint
      // and leaves pixels outside of the image boundary fully masked
      // .eq(0) turns the 0s (clouds) into 1s so these can be summed and counted
      return isOccluded.rename("occluded_count");
    }).sum();
  
    // LAYER 2: class change detection count - how many times a pixel changed from a FROM class to a TO class
    var classChangeDetectionCount = changeEvents.select("is_change").sum().rename("total_changes")
  
    // LAYER 3: firstChangeDate (FCD) and Combined Alert Detection (changes that pass the delta index threshold)
    // firstChangeDateAboveThreshold computed above
  
    // LAYER 4: Post-FCD Combined Alert Count (count of changes that pass the delta index threshold since the first change date)
    // get the counts by summing the post-FCD change
    var postFCDChangeCount = postChangeEvaluation.select("post_fcd_change").sum().rename("post_fcd_change_count");
  
    // LAYER 5: Post-FCD Combined Non-Alert Count (count of no changes since the first change date)
    // get the counts by summing the post-FCD no changes
    var postFCDNoChangeCount = postChangeEvaluation.select("post_fcd_nochange").sum().rename("post_fcd_nochange_count");
  
    // LAYER 6: Post-FCD Occluded Image Count
    var postFCDOccludedCount = postChangeEvaluation.select("post_fcd_occluded").sum().rename("post_fcd_occluded_count");
  
    // LAYER 7: Post-FCD Valid Image Count
    var postFCDValidImageCount = postFCDChangeCount.add(postFCDNoChangeCount).rename("post_fcd_valid_image_count");
  
    // LAYER 8: Post-FCD Change Detection Repeatability
    var postFCDChangeDetectionRepeatability = postFCDChangeCount
      .divide(postFCDValidImageCount)
      .multiply(100)
      .rename("post_fcd_change_repeatability_pct");
  
    // LAYER 9: Binary time-series decision
    var binaryTimeSeriesDecision = postFCDChangeDetectionRepeatability.gte(percentageProbabilityThreshold)
      .and(postFCDChangeCount.gte(minRequiredValidatedDetectionsThreshold))
      .rename("binary_timeseries_decision");
      
    // update pixels with 0, to be included in the mask, as these are not important to us
    var binaryTimeSeriesDecisionMasked = binaryTimeSeriesDecision.updateMask(binaryTimeSeriesDecision);
  
    // LAYER 10: FCD Decision Map
    var FCDDecisionMap = firstChangeDateAboveThreshold
      .updateMask(binaryTimeSeriesDecisionMasked)
      .rename("fcd_decision_map");
  
    // LAYER 11: delta index only change detection count
    var deltaIndexChangeDetectionCount = changeEvents
      .select("delta_index_thresholded_mask")
      .sum()
      .rename("delta_index_change_count");
  
    // LAYER 12: Binary delta index Alert Decision Map
    var binaryDeltaIndexDecisionMap = deltaIndexChangeDetectionCount.gte(indexGate.minRequiredDeltaIndexDetectionsThreshold)
      .rename("binary_delta_index_decision_map");
  
    // LAYER 13: Binary delta Class Alert Decision Map // includes passing delta index threshold
    var classChangeDetectionCountNoIndex = changeEvents.select("transition_mask").sum().rename("total_class_changes_no_index")
  
    var binaryDeltaClassDecisionMap = classChangeDetectionCountNoIndex.gte(minRequiredClassifierDetectionsThreshold)
      .rename("binary_delta_class_decision_map");
  
    // LAYER 14: Combined delta index & delta class Decision Map
    var binaryCombinedDeltaDecisionMap = binaryDeltaClassDecisionMap.and(binaryDeltaIndexDecisionMap)
      .rename("binary_combined_delta_decision_map");
  
    // LAYER 15: count the number of pixels that were a FROM class
    // "counts" by summing across the collection https://developers.google.com/earth-engine/apidocs/ee-imagecollection-sum
    var fromClassCount = changeEvents.select("is_from_class").sum().rename("from_class_count");
    // ************
  
    // LAYER 16: count the number of pixels that were a TO class
    var toClassCount = changeEvents.select("is_to_class").sum().rename("to_class_count");
  
    // LAYER 17: L15.and(L16) Binary Decision Thresholds on FROM and TO classification counts
    var binaryDecisionFromToMap = fromClassCount.gte(minRequiredFromDetectionsThreshold)
      .and(toClassCount.gte(minRequiredToDetectionsThreshold))
      .rename("binary_decision_from_to_map");
  
    return {
      changeReport: ee.Image([
        availableImageCount,
        occludedCount,
        classChangeDetectionCount,
        firstChangeDateAboveThreshold,
        postFCDChangeCount,
        postFCDNoChangeCount,
        postFCDOccludedCount,
        postFCDValidImageCount,
        postFCDChangeDetectionRepeatability,
        binaryTimeSeriesDecisionMasked,
        FCDDecisionMap,
        deltaIndexChangeDetectionCount,
        binaryDeltaIndexDecisionMap,
        binaryDeltaClassDecisionMap,
        binaryCombinedDeltaDecisionMap,
        fromClassCount,
        toClassCount,
        binaryDecisionFromToMap
      ])
    };
  } // END OF BRANCH
  
  // =========================
  // 5B. BRANCH: IF NO SPECTRAL INDEX IS SUPPLIED
  // =========================
  
  if (!indexGate.use) {
        
    // set a mask to use for the index bands we are substituting as constants, instead
    // .count() pulls all pixels are classified
    var baseMask = baselineClassification.mask();
    
    // LAYER 0: count the number of images within the collection
    var availableImageCount = ee.Image(hazeFilteredClassifiedMonitoringCollection.size())
      .clip(aoi)
      .rename("available_image_count");
      
    // LAYER 1: count the number of occluded images per pixel
    var occludedCount = hazeFilteredClassifiedMonitoringCollection.map(function(image) {
      var isOccluded = image.select("classification").mask().unmask(0).eq(0);
      // .mask() returns a 1 for valid pixels and is masked for cloudy pixels
      // unmask(0) converts these cloudy pixels to 0, but it also respects the image footprint
      // and leaves pixels outside of the image boundary fully masked
      // .eq(0) turns the 0s (clouds) into 1s so these can be summed and counted
      return isOccluded.rename("occluded_count");
    }).sum();
  
    // LAYER 2: class change detection count - how many times a pixel changed from a FROM class to a TO class
    var classChangeDetectionCount = changeEvents.select("is_change").sum().rename("total_changes")
  
    // LAYER 3: firstChangeDate (FCD) and Combined Alert Detection (changes that pass the delta index threshold)
    // firstChangeDateAboveThreshold computed above
  
    // LAYER 4: Post-FCD Combined Alert Count (count of changes that pass the delta index threshold since the first change date)
    // get the counts by summing the post-FCD change
    var postFCDChangeCount = postChangeEvaluation.select("post_fcd_change").sum().rename("post_fcd_change_count");
  
    // LAYER 5: Post-FCD Combined Non-Alert Count (count of no changes since the first change date)
    // get the counts by summing the post-FCD no changes
    var postFCDNoChangeCount = postChangeEvaluation.select("post_fcd_nochange").sum().rename("post_fcd_nochange_count");
  
    // LAYER 6: Post-FCD Occluded Image Count
    var postFCDOccludedCount = postChangeEvaluation.select("post_fcd_occluded").sum().rename("post_fcd_occluded_count");
  
    // LAYER 7: Post-FCD Valid Image Count
    var postFCDValidImageCount = postFCDChangeCount.add(postFCDNoChangeCount).rename("post_fcd_valid_image_count");
  
    // LAYER 8: Post-FCD Change Detection Repeatability
    var postFCDChangeDetectionRepeatability = postFCDChangeCount
      .divide(postFCDValidImageCount)
      .multiply(100)
      .rename("post_fcd_change_repeatability_pct");
  
    // LAYER 9: Binary time-series decision
    var binaryTimeSeriesDecision = postFCDChangeDetectionRepeatability.gte(percentageProbabilityThreshold)
      .and(postFCDChangeCount.gte(minRequiredValidatedDetectionsThreshold))
      .rename("binary_timeseries_decision");
      
    // update pixels with 0, to be included in the mask, as these are not important to us
    var binaryTimeSeriesDecisionMasked = binaryTimeSeriesDecision.updateMask(binaryTimeSeriesDecision);
  
    // LAYER 10: FCD Decision Map
    var FCDDecisionMap = firstChangeDateAboveThreshold
      .updateMask(binaryTimeSeriesDecisionMasked)
      .rename("fcd_decision_map");
  
    // LAYER 11: delta index only change detection count
    var deltaIndexChangeDetectionCountPlaceholder = ee.Image.constant(0)
      .rename("delta_index_change_count")
      .updateMask(baseMask);
  
    // LAYER 12: Binary delta index Alert Decision Map
    var binaryDeltaIndexDecisionMapPlaceholder = ee.Image.constant(0)
      .rename("binary_delta_index_decision_map")
      .updateMask(baseMask);
  
    // LAYER 13: Binary delta Class Alert Decision Map // includes passing delta index threshold
    var classChangeDetectionCountNoIndex = changeEvents
      .select("transition_mask")
      .sum()
      .rename("total_class_changes_no_index");

    var binaryDeltaClassDecisionMap = classChangeDetectionCountNoIndex.gte(minRequiredClassifierDetectionsThreshold)
      .rename("binary_delta_class_decision_map");
  
    // LAYER 14: Combined delta index & delta class Decision Map
    var binaryCombinedDeltaDecisionMapPlaceholder = ee.Image.constant(0)
      .rename("binary_combined_delta_decision_map")
      .updateMask(baseMask);
  
    // LAYER 15: count the number of pixels that were a FROM class
    // "counts" by summing across the collection https://developers.google.com/earth-engine/apidocs/ee-imagecollection-sum
    var fromClassCount = changeEvents.select("is_from_class").sum().rename("from_class_count");
    // ************
  
    // LAYER 16: count the number of pixels that were a TO class
    var toClassCount = changeEvents.select("is_to_class").sum().rename("to_class_count");
  
    // LAYER 17: L15.and(L16) Binary Decision Thresholds on FROM and TO classification counts
    var binaryDecisionFromToMap = fromClassCount.gte(minRequiredFromDetectionsThreshold)
      .and(toClassCount.gte(minRequiredToDetectionsThreshold))
      .rename("binary_decision_from_to_map");
  
    return {
      changeReport: ee.Image([
        availableImageCount,
        occludedCount,
        classChangeDetectionCount,
        firstChangeDateAboveThreshold,
        postFCDChangeCount,
        postFCDNoChangeCount,
        postFCDOccludedCount,
        postFCDValidImageCount,
        postFCDChangeDetectionRepeatability,
        binaryTimeSeriesDecisionMasked,
        FCDDecisionMap,
        deltaIndexChangeDetectionCountPlaceholder,
        binaryDeltaIndexDecisionMapPlaceholder,
        binaryDeltaClassDecisionMap,
        binaryCombinedDeltaDecisionMapPlaceholder,
        fromClassCount,
        toClassCount,
        binaryDecisionFromToMap
      ])
    };
  } // END OF BRANCH
  
};

exports.run_change_detection = run_change_detection;