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
        const case3Result = await handleCase3UnknownUnits(quantity, parsedInput, usdaResult, mappedNutrition);
        
        // If Case 3 returns null, it means no matched food was found, so we should fall back to Edamam
        if (case3Result === null) {
          console.log("=== USDA API SEARCH NO MATCHED FOOD (CASE 3) ===");
          console.log("No matched food found for household units, falling back to Edamam API");
          return {
            success: false,
            source: "usda",
            message: "No matched food found for household units"
          };
        }
        
        return case3Result;
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
  
  // For Case 1, we want to store a standard household serving
  // Use the base serving size as the household serving size
  const householdServing = `${baseServingSize} ${baseServingUnit}`;
  
  // Since nutrition data is normalized to per 1g/1ml, the multiplier should be the total grams
  const totalWeight = baseServingSize * quantity;
  
  const conversion = {
    multiplier: totalWeight, // Total weight multiplier (e.g., 112 for 4 bread × 28g)
    convertedQuantity: totalWeight,
    convertedUnit: baseServingUnit,
    matchedFood: null,
    householdServing: householdServing,
    servingQuantity: baseServingSize,
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

async function handleCase3UnknownUnits(quantity, parsedInput, usdaResult, mappedNutrition) {
  console.log("=== CASE 3: Unknown units -", parsedInput.quantity, "===");
  console.log("Taking first response and finding matched food with householdServingFullText");
  
  // Always use the first response for nutrition data
  const firstResponse = usdaResult.response;
  const firstResponseNutrition = mappedNutrition;
  
  // Find the matched food with householdServingFullText
  let matchedFood = null;
  let householdServingFullText = "";
  let matchedServingSize = firstResponse.servingSize || 1;
  
  if (usdaResult.foods && usdaResult.foods.length > 0) {
    // Search for a food item that has householdServingFullText matching our unit
    const matchingFoods = usdaResult.foods.filter(food => 
      food.householdServingFullText && 
      food.householdServingFullText.toLowerCase().includes(parsedInput.quantity.toLowerCase())
    );
    
    if (matchingFoods.length > 0) {
      // Take the first matching food
      console.log("Matching foods:", matchingFoods);
      matchedFood = matchingFoods[0];
      householdServingFullText = matchedFood.householdServingFullText;
      matchedServingSize = matchedFood.servingSize || 1;

      console.log("Matched food:", matchedFood);
    } else {
      console.log("No food found with matching householdServingFullText, falling back to Edamam API");
      // Return null to trigger fallback to Edamam API
      return null;
    }
  } else {
    console.log("No foods array available, falling back to Edamam API");
    // Return null to trigger fallback to Edamam API
    return null;
  }
  
  // Use the existing household unit conversion logic from baseUnitConverter
  const { extractServingQuantity } = require("../utils/baseUnitConverter");
  
  // Extract the serving quantity from householdServingFullText
  const servingQuantity = extractServingQuantity(householdServingFullText, parsedInput.quantity);
  
  // Calculate the weight per unit: if USDA says "2 slices = 152g", then 1 slice = 76g
  const weightPerUnit = matchedServingSize / servingQuantity;
  
  // Calculate the total weight for the requested quantity
  const convertedQuantity = weightPerUnit * quantity;
  
  // Since nutrition data is normalized to per 1g, the multiplier should be the total grams
  const multiplier = convertedQuantity;
  const convertedUnit = matchedFood ? matchedFood.servingSizeUnit : (firstResponse.servingSizeUnit || "g");
  
  const conversion = {
    multiplier: multiplier, // Use the proper multiplier (e.g., 0.5 for 1 slice when USDA says 2 slices)
    convertedQuantity: convertedQuantity,
    convertedUnit: convertedUnit,
    matchedFood: matchedFood ? matchedFood.description : null,
    householdServing: householdServingFullText,
    servingQuantity: servingQuantity,
    fromUSDA: true,
    matchedServingSize: matchedServingSize
  };
  
  console.log("=== USDA API SEARCH SUCCESS (CASE 3) ===");
  console.log("Using first response nutrition data");
  console.log("Matched food serving size:", matchedServingSize, convertedUnit);
  console.log("Final quantity:", convertedQuantity, convertedUnit);
  
  return {
    success: true,
    source: "usda",
    nutritionData: usdaResult,
    conversion: conversion,
    response: firstResponseNutrition,
    foods: usdaResult.foods
  };
}

module.exports = {
  searchUSDA
};

