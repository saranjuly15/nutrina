const { getEdamamNutritionData } = require("./externalApiServices");
const { mapNutritionData } = require("./nutritionMappingService");

// ============================================================================
// EDAMAM API SEARCH SERVICE
// ============================================================================

/**
 * Searches Edamam API for nutrition data
 * Note: Edamam search is simplified - we send the complete food name to Edamam
 * (e.g., "6 slices of chicken fricot") and use the response directly
 * No conversions or multiplications needed
 */
async function searchEdamam(quantity, parsedInput, searchFoodName, foodName) {
  console.log("=== EDAMAM API SEARCH START ===");
  console.log("Searching Edamam for:", foodName);
  console.log("Quantity:", quantity);
  console.log("Parsed input:", parsedInput);
  
  try {
    // Call Edamam API with the complete food name
    const edamamResult = await getEdamamNutritionData(foodName);
    
    if (edamamResult.success) {
      console.log("Edamam API call successful");
      
      // Map Edamam nutrition data to standardized format
      const mappedNutrition = mapNutritionData(edamamResult.response, 'edamam');
      
      // For Edamam, we use the data directly as returned
      // Nutrition data is normalized to per 1g, so we need to multiply by total weight
      const baseServingSize = edamamResult.response.totalWeight || 1;
      const baseServingUnit = "g";
      
      const conversion = {
        multiplier: baseServingSize, // Multiply by total weight since data is per 1g
        convertedQuantity: baseServingSize,
        convertedUnit: baseServingUnit,
        matchedFood: null,
        householdServing: parsedInput?.quantity ? `${quantity} ${parsedInput.quantity}` : null,
        servingQuantity: quantity, // Store the actual quantity for conversion calculations
        fromEdamam: true
      };
      
      console.log("=== EDAMAM API SEARCH SUCCESS ===");
      console.log("Edamam conversion:", conversion);
      return {
        success: true,
        source: "edamam",
        nutritionData: edamamResult,
        conversion: conversion,
        response: mappedNutrition,
        foods: null
      };
    } else {
      console.log("=== EDAMAM API SEARCH NO RESULTS ===");
      console.log("Edamam API result:", edamamResult.message);
      return {
        success: false,
        source: "edamam",
        message: edamamResult.message
      };
    }
  } catch (error) {
    console.error("=== EDAMAM API SEARCH ERROR ===");
    console.error("Edamam API error:", error.message);
    return {
      success: false,
      source: "edamam",
      error: error.message,
      message: "Edamam API search failed"
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  searchEdamam
};

