const { knownUnits } = require("../utils/helpers");
const { convertApiToBaseUnit } = require("../utils/baseUnitConverter");
const { getUSDANutritionData } = require("./externalApiServices");
const { mapNutritionData } = require("./nutritionMappingService");

// ============================================================================
// USDA API SEARCH AND CONVERSIONS
// ============================================================================

async function searchUSDA(quantity, parsedInput, searchFoodName, foodName) {
  console.log("=== USDA API SEARCH START ===");
  console.log("Searching USDA for:", searchFoodName);
  console.log("Quantity:", quantity);
  console.log("Parsed input:", parsedInput);
  
  try {
    // Call USDA API
    const usdaResult = await getUSDANutritionData(searchFoodName, parsedInput?.quantity);
    
    if (usdaResult.success) {
      console.log("USDA API call successful");
      
      // Map USDA nutrition data to standardized format
      const mappedNutrition = mapNutritionData(usdaResult.response, 'usda');
      
      // Handle the three different cases
      if (!parsedInput?.quantity) {
        // CASE 1: No input unit (e.g., "4 bread") - Direct search, first response, multiply by quantity
        return handleCase1NoUnit(quantity, usdaResult, mappedNutrition);
      } else if (knownUnits.includes(parsedInput.quantity)) {
        // CASE 2: Known units (e.g., "400 ml water", "20 g rice") - Search, first response, do conversions
        return handleCase2KnownUnits(quantity, parsedInput, usdaResult, mappedNutrition, searchFoodName, foodName);
      } else {
        // CASE 3: Unknown units (e.g., "2 pieces of bread") - Search, filter by householdServingFullText
        return handleCase3UnknownUnits(quantity, parsedInput, usdaResult, mappedNutrition, searchFoodName, foodName);
      }
    } else {
      console.log("=== USDA API SEARCH NO RESULTS ===");
      console.log("USDA API result:", usdaResult.message);
      return {
        success: false,
        source: "usda",
        message: usdaResult.message
      };
    }
  } catch (error) {
    console.error("=== USDA API SEARCH ERROR ===");
    console.error("USDA API error:", error.message);
    return {
      success: false,
      source: "usda",
      error: error.message,
      message: "USDA API search failed"
    };
  }
}

// ============================================================================
// CASE 1: No input unit (e.g., "4 bread")
// ============================================================================

function handleCase1NoUnit(quantity, usdaResult, mappedNutrition) {
  console.log("CASE 1: No input unit - Direct search, first response, multiply by quantity");
  
  const baseServingSize = usdaResult.response.servingSize || 1;
  const baseServingUnit = usdaResult.response.servingSizeUnit || "g";
  
  const conversion = {
    multiplier: quantity, // Simple quantity multiplier
    convertedQuantity: baseServingSize * quantity,
    convertedUnit: baseServingUnit,
    matchedFood: null,
    householdServing: null,
    servingQuantity: 1,
    fromUSDA: true
  };
  
  console.log("=== USDA API SEARCH SUCCESS (CASE 1) ===");
  return {
    success: true,
    source: "usda",
    nutritionData: usdaResult,
    conversion: conversion,
    response: mappedNutrition,
    foods: usdaResult.foods
  };
}

// ============================================================================
// CASE 2: Known units (e.g., "400 ml water", "20 g rice")
// ============================================================================

async function handleCase2KnownUnits(quantity, parsedInput, usdaResult, mappedNutrition, searchFoodName, foodName) {
  console.log("CASE 2: Known units - Search, first response, do conversions");
  
  const baseServingSize = usdaResult.response.servingSize || 1;
  const baseServingUnit = usdaResult.response.servingSizeUnit || "g";
  
  const conversion = await convertApiToBaseUnit(
    quantity,
    parsedInput.quantity,
    baseServingSize,
    baseServingUnit,
    usdaResult.foods || null,
    searchFoodName,
    foodName
  );
  
  // Check if conversion failed (returned null)
  if (!conversion) {
    console.log("=== USDA API SEARCH NO CONVERSION POSSIBLE (CASE 2) ===");
    return {
      success: false,
      source: "usda",
      message: "USDA data found but conversion not possible"
    };
  }
  
  console.log("=== USDA API SEARCH SUCCESS (CASE 2) ===");
  return {
    success: true,
    source: "usda",
    nutritionData: usdaResult,
    conversion: conversion,
    response: mappedNutrition,
    foods: usdaResult.foods
  };
}

// ============================================================================
// CASE 3: Unknown units (e.g., "2 pieces of bread")
// ============================================================================

async function handleCase3UnknownUnits(quantity, parsedInput, usdaResult, mappedNutrition, searchFoodName, foodName) {
  console.log("CASE 3: Unknown units - Search, filter by householdServingFullText");
  
  const baseServingSize = usdaResult.response.servingSize || 1;
  const baseServingUnit = usdaResult.response.servingSizeUnit || "g";
  
  const conversion = await convertApiToBaseUnit(
    quantity,
    parsedInput.quantity,
    baseServingSize,
    baseServingUnit,
    usdaResult.foods || null,
    searchFoodName,
    foodName
  );
  
  // Check if conversion failed (returned null)
  if (!conversion) {
    console.log("=== USDA API SEARCH NO CONVERSION POSSIBLE (CASE 3) ===");
    return {
      success: false,
      source: "usda",
      message: "USDA data found but conversion not possible"
    };
  }
  
  // If we have a matched food, use its nutrition data instead of the first response
  let nutritionToUse = mappedNutrition;
  if (conversion.matchedFood && usdaResult.foods) {
    const matchedFood = usdaResult.foods.find(food => 
      food.description === conversion.matchedFood
    );
    
    if (matchedFood) {
      console.log("Using nutrition data from matched food:", conversion.matchedFood);
      // Map the matched food's nutrition data
      const { mapNutritionData } = require("./nutritionMappingService");
      nutritionToUse = mapNutritionData(matchedFood, 'usda');
    } else {
      console.log("Matched food not found in foods array, using first response nutrition");
    }
  } else {
    console.log("No matched food found, using first response nutrition");
  }
  
  console.log("=== USDA API SEARCH SUCCESS (CASE 3) ===");
  return {
    success: true,
    source: "usda",
    nutritionData: usdaResult,
    conversion: conversion,
    response: nutritionToUse,
    foods: usdaResult.foods
  };
}

module.exports = {
  searchUSDA
};

