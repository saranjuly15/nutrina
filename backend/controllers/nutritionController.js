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

// ============================================================================
// DATABASE SAVING FUNCTIONS
// ============================================================================

async function saveNutritionData(storageName, nutritionDataToSave, conversion, dbSource, originalServingSize, originalServingUnit, parsedInput) {
  // Check if a record with this name already exists
  const existingRecord = await Nutrition.findOne({ name: storageName });
  
  if (existingRecord) {
    console.log("Found existing record for:", storageName);
    
    // If we have household serving info to add
    if (conversion && conversion.householdServing) {
      const householdText = conversion.householdServing;
      
      // For Edamam, use the originalServingSize (totalWeight), for USDA use conversion values
      let servingSize;
      if (dbSource === 'edamam') {
        servingSize = originalServingSize; // This is totalWeight from Edamam
      } else {
        servingSize = conversion.matchedServingSize || conversion.servingQuantity || 1;
      }
      
      // For Case 1 (no quantity specified), use "serving" as the unit
      let servingUnit;
      if (!parsedInput?.quantity) {
        servingUnit = "serving";
      } else {
        // For household units, use the parsed quantity
        servingUnit = parsedInput.quantity;
      }
      
      // Check if this household serving already exists
      const existingServing = existingRecord.householdServings.find(serving => 
        serving.servingUnit === servingUnit && serving.servingSize === servingSize
      );
      
      if (!existingServing) {
        // Add new household serving
        existingRecord.householdServings.push({
          servingSize: servingSize,
          servingUnit: servingUnit,
        });
        
        await existingRecord.save();
        console.log("Added new household serving to existing record");
      } else {
        console.log("Household serving already exists in record");
      }
    }
    
    return existingRecord;
  } else {
    // Create new record
    const nutrition = createNutritionDocument(storageName, nutritionDataToSave, conversion, dbSource, originalServingSize, originalServingUnit, parsedInput);
    await nutrition.save();
    console.log("Created new nutrition record with name:", storageName);
    return nutrition;
  }
}

function createStorageName(cleanSearchTerm, conversion) {
  // Always use just the clean search term for storage name
  // Household servings will be stored in the householdServings array
  return cleanSearchTerm;
}

function createNutritionDocument(storageName, mappedNutrition, conversion, source, originalServingSize, originalServingUnit, parsedInput) {
  // Get nutrition units from mapping service
  const { getNutritionUnits } = require("../services/nutritionMappingService");
  const nutritionUnits = getNutritionUnits();
  
  // Since nutrition data is now normalized to per 1g/1ml, baseServingSize should always be 1
  const baseServingSize = 1;
  // Use the original serving unit from the API response (e.g., ml for liquids, g for solids)
  const baseServingUnit = originalServingUnit || "g";
  
  // Prepare household servings array
  let householdServings = [];
  
  if (conversion && conversion.householdServing) {
    // Extract serving size and unit from householdServing text
    const householdText = conversion.householdServing;
    
    // For Edamam, use the originalServingSize (totalWeight), for USDA use conversion values
    let servingSize;
    if (source === 'edamam') {
      servingSize = originalServingSize; // This is totalWeight from Edamam
    } else {
      servingSize = conversion.matchedServingSize || conversion.servingQuantity || 1;
    }
    
    // For Case 1 (no quantity specified), use "serving" as the unit
    let servingUnit;
    if (!parsedInput?.quantity) {
      servingUnit = "serving";
    } else {
      // For household units, use the parsed quantity
      servingUnit = parsedInput.quantity;
    }
    
    householdServings.push({
      servingSize: servingSize,
      servingUnit: servingUnit,
    });
  }
  
  return new Nutrition({
    name: storageName,
    nutrients: mappedNutrition, // Already normalized to per 1g/1ml
    nutritionUnits: nutritionUnits,
    baseServingSize: baseServingSize,
    baseServingUnit: baseServingUnit,
    householdServings: householdServings,
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
      if (atlasSearchResults[0].householdServings && 
          Array.isArray(atlasSearchResults[0].householdServings) && 
          atlasSearchResults[0].householdServings.length > 0 && 
          ((parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)) ||
           (parsedInput?.number && !parsedInput?.quantity))) {
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

      // Since nutrition data is now normalized to per 1g/1ml, multiply by the converted quantity
      const convertedQuantity = conversion ? conversion.convertedQuantity : quantity;
      const calculatedNutrients = applyMultiplierToNutrients(nutrients, convertedQuantity);

      return res.status(200).json({
        ...calculatedNutrients,
        parsedInput: parsedInput,
        conversion: {
          multiplier: convertedQuantity,
          convertedUnit: conversion.convertedUnit,
          householdUnit: conversion.householdServing || null,
          matchedFood: conversion.matchedFood || null,
          baseServingSize: 1 // Always 1 since data is normalized per 1g/1ml
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
     
     const nutrition = await saveNutritionData(storageName, nutritionDataToSave, conversion, dbSource, originalServingSize, originalServingUnit, parsedInput);

    console.log("Nutrition data saved with name:", storageName);

    // ============================================================================
    // RETURN RESPONSE
    // ============================================================================
    // Since nutrition data is now normalized to per 1g/1ml, multiply by the converted quantity
    const convertedQuantity = conversion ? conversion.convertedQuantity : quantity;
    const calculatedNutritionInfo = applyMultiplierToNutrients(finalNutritionInfo, convertedQuantity);

    res.status(200).json({
      ...calculatedNutritionInfo,
      parsedInput: parsedInput,
      conversion: {
        multiplier: convertedQuantity,
        convertedUnit: conversion ? conversion.convertedUnit : null,
        householdUnit: conversion ? conversion.householdServing || null : null,
        matchedFood: conversion ? conversion.matchedFood || null : null,
        baseServingSize: 1 // Always 1 since data is normalized per 1g/1ml
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
