const Nutrition = require("../models/Nutrition");
const { normalizeFoodName, parseFoodInput, unknownUnits, knownUnits } = require("../utils/helpers");
const { performCompleteSearch, createHouseholdServingConversion } = require("../services/searchService");


// Nutrition Calculation Functions
function applyMultiplierToNutrients(nutrients, multiplier) {
  if (multiplier === 1) return nutrients;

  const calculatedNutrients = { ...nutrients };

  // Apply multiplier to all nutrition fields
  Object.keys(calculatedNutrients).forEach(key => {
    if (typeof calculatedNutrients[key] === 'number') {
      calculatedNutrients[key] *= multiplier;
    }
  });

  // Round the calculated values to 2 decimal places
  const { roundNutritionData } = require("../services/nutritionMappingService");
  return roundNutritionData(calculatedNutrients);
}

function createStorageName(cleanSearchTerm, conversion) {
  let storageName = cleanSearchTerm;
  if (conversion && conversion.householdServing) {
    // Use generic format: foodname_unit (without quantity)
    storageName = `${cleanSearchTerm}_${conversion.householdServing.split(' ')[1]}`;
  }
  return storageName;
}

function createNutritionDocument(storageName, mappedNutrition, conversion, source, originalServingSize, originalServingUnit) {
  // Get nutrition units from mapping service
  const { getNutritionUnits } = require("../services/nutritionMappingService");
  const nutritionUnits = getNutritionUnits();
  
  // Round baseServingSize to 2 decimal places
  const roundedBaseServingSize = Math.round((originalServingSize || 1) * 100) / 100;
  
  return new Nutrition({
    name: storageName,
    nutrients: mappedNutrition,
    nutritionUnits: nutritionUnits,
    baseServingSize: roundedBaseServingSize,
    baseServingUnit: originalServingUnit || "g",
    householdServing: {
      servingSize: conversion && conversion.householdServing ? conversion.servingQuantity : null,
      servingUnit: conversion && conversion.householdServing ? conversion.householdServing.split(' ')[1] || "" : ""
    },
    fromUSDA: source === 'usda',
    fromEdamam: source === 'edamam'
  });
}

// Main Controller Functions
const getNutrition = async (req, res) => {
  const { foodName } = req.query;

  try {
    if (!foodName) {
      return res.status(400).json({ message: "Food name is required" });
    }

    // Parse the input using the new parser
    const parsedInput = parseFoodInput(foodName);
    console.log("Parsed input:", parsedInput);

    // Extract quantity and food name
    const quantity = parsedInput ? parsedInput.number : 1;
    const searchFoodName = parsedInput ? parsedInput.food : foodName;

    // Use improved normalization
    const cleanSearchTerm = normalizeFoodName(searchFoodName);
    console.log("Searching for:", cleanSearchTerm);
    


    // ============================================================================
    // PERFORM COMPLETE SEARCH (Database → USDA → Edamam)
    // ============================================================================
    const searchResult = await performCompleteSearch(quantity, parsedInput, searchFoodName, foodName);
    
    console.log("Search result source:", searchResult.source);
    console.log("Search method:", searchResult.searchMethod);

    // Check if search was successful
    if (!searchResult.success) {
      console.log("Search failed:", searchResult.message);
      return res.status(404).json({
        message: searchResult.message,
        error: searchResult.error || "No nutrition data found"
      });
    }

    // ============================================================================
    // HANDLE DATABASE RESULTS
    // ============================================================================
    if (searchResult.source === "database") {
      console.log("Processing database result");
      const atlasSearchResults = searchResult.results;
      
      console.log("Final selected result:", atlasSearchResults[0]?.name);

      // Use the nutrients directly from database (already in standardized format)
      const nutrients = atlasSearchResults[0].nutrients;

      // Calculate proper multiplier based on units
      const baseServingSize = atlasSearchResults[0].baseServingSize || 1;
      const baseServingUnit = atlasSearchResults[0].baseServingUnit || "g";
      
      // Use stored household serving info if available
      let conversion;
      if (atlasSearchResults[0].householdServing.servingSize && parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)) {
        // Use stored household serving information
        conversion = createHouseholdServingConversion(quantity, parsedInput, atlasSearchResults[0]);
      } else {
        // Use regular conversion for known units or no unit
        const { convertAtlasSearchToBaseUnit } = require("../utils/baseUnitConverter");
        conversion = await convertAtlasSearchToBaseUnit(
          quantity,
          parsedInput?.quantity,
          baseServingSize,
          baseServingUnit,
          searchFoodName,
          foodName
        );
      }

      const calculatedNutrients = applyMultiplierToNutrients(nutrients, conversion.multiplier);

             return res.status(200).json({
         ...calculatedNutrients,
         parsedInput: parsedInput,
         conversion: {
           multiplier: conversion.multiplier,
           convertedUnit: conversion.convertedUnit,
           householdUnit: conversion.householdServing || null,
           matchedFood: conversion.matchedFood || null,
           baseServingSize: baseServingSize
         },
         source: "database"
       });
    }

    // ============================================================================
    // HANDLE API RESULTS (USDA or Edamam)
    // ============================================================================
    console.log("Processing API result from:", searchResult.source);
    
    const nutritionInfo = searchResult.response;
    const conversion = searchResult.conversion;
    
    console.log("Conversion:", conversion);

    if (!nutritionInfo) {
      throw new Error("No nutrition information found from APIs.");
    }
    
    nutritionInfo.edamam = searchResult.source === "edamam";

    // The nutrition data is already properly mapped in the search service
    // For case 3 (unknown units), the search service now returns the correct nutrition data
    // from the matched food instead of the first response
    let finalNutritionInfo = nutritionInfo;

    // ============================================================================
    // SAVE TO DATABASE (Controller decides whether to save)
    // ============================================================================
    console.log("Saving nutrition data to database");
    
    // Store the mapped nutrition data
    const storageName = createStorageName(cleanSearchTerm, conversion);
    
         // Get original serving size from the API response based on the case
     let originalServingSize, originalServingUnit;
     
     if (searchResult.source === 'usda') {
       // For USDA results, determine serving size based on the case
       if (!parsedInput?.quantity) {
         // CASE 1: No input unit - use first response
         originalServingSize = searchResult.nutritionData.response.servingSize || 1;
         originalServingUnit = searchResult.nutritionData.response.servingSizeUnit || "g";
       } else if (knownUnits.includes(parsedInput.quantity)) {
         // CASE 2: Known units - use first response
         originalServingSize = searchResult.nutritionData.response.servingSize || 1;
         originalServingUnit = searchResult.nutritionData.response.servingSizeUnit || "g";
       } else {
         // CASE 3: Unknown units - use matched food's serving size if available
         if (conversion && conversion.matchedFood && conversion.convertedQuantity) {
           // Use the matched food's serving size from conversion
           originalServingSize = conversion.convertedQuantity / conversion.multiplier;
           originalServingUnit = conversion.convertedUnit;
         } else {
           // Fallback to first response
           originalServingSize = searchResult.nutritionData.response.servingSize || 1;
           originalServingUnit = searchResult.nutritionData.response.servingSizeUnit || "g";
         }
       }
     } else if (searchResult.source === 'edamam') {
       originalServingSize = searchResult.nutritionData.response.totalWeight || 1;
       originalServingUnit = "g";
     }
    
         // Use the mapped nutrition data from search result
     const nutritionDataToSave = searchResult.response;
     
     // Use the source directly from search result
     const dbSource = searchResult.source;
     
     const nutrition = createNutritionDocument(storageName, nutritionDataToSave, conversion, dbSource, originalServingSize, originalServingUnit);
    await nutrition.save();

    console.log("Nutrition data saved with name:", storageName);

    // ============================================================================
    // RETURN RESPONSE
    // ============================================================================
    // Calculate totals for display if conversion multiplier is not 1
    const multiplier = conversion ? conversion.multiplier : 1;
    const calculatedNutritionInfo = applyMultiplierToNutrients(finalNutritionInfo, multiplier);

    res.status(200).json({
      ...calculatedNutritionInfo,
      parsedInput: parsedInput,
      conversion: {
        multiplier: multiplier,
        convertedUnit: conversion ? conversion.convertedUnit : null,
        householdUnit: conversion ? conversion.householdServing || null : null,
        matchedFood: conversion ? conversion.matchedFood || null : null,
        baseServingSize: originalServingSize
      },
             source: searchResult.source
    });
  } catch (error) {
    console.error("Search error:", error);

    // Handle Atlas search specific errors
    if (error.message && error.message.includes("$search")) {
      return res.status(500).json({
        message:
          "Atlas search error - please check your search index configuration",
        error: error.message,
      });
    }

    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const getAllNutrition = async (req, res) => {
  try {
    const allNutrition = await Nutrition.find({}).sort({ createdAt: -1 });
    res.status(200).json({
      count: allNutrition.length,
      data: allNutrition,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};



module.exports = {
  getNutrition,
  getAllNutrition,
};
