const { getEdamamNutritionData } = require("../services/externalApiServices");
const { knownUnits, unknownUnits } = require("./helpers");

// Conversion Functions
function handleKnownUnitConversion(
  inputQuantity,
  inputUnit,
  baseServingSize,
  baseServingUnit
) {
  let multiplier = 1;
  let convertedQuantity = inputQuantity;
  let convertedUnit = inputUnit;

  // Handle common unit conversions
  if (inputUnit === "ml" && baseServingUnit === "ml") {
    multiplier = inputQuantity / baseServingSize;
    convertedQuantity = inputQuantity;
    convertedUnit = "ml";
  } else if (inputUnit === "g" && baseServingUnit === "g") {
    multiplier = inputQuantity / baseServingSize;
    convertedQuantity = inputQuantity;
    convertedUnit = "g";
  } else if (inputUnit === "litre" && baseServingUnit === "ml") {
    // 1 litre = 1000ml
    const litreInMl = inputQuantity * 1000;
    multiplier = litreInMl / baseServingSize;
    convertedQuantity = litreInMl;
    convertedUnit = "ml";
  } else {
    // Default: treat as multiplier
    multiplier = inputQuantity;
    convertedQuantity = inputQuantity;
    convertedUnit = baseServingUnit;
  }

  return {
    multiplier,
    convertedQuantity,
    convertedUnit,
    baseServingSize
  };
}

function findMatchingHouseholdFoods(usdaFoods, inputUnit, searchFoodName) {
  const searchFoodLower = searchFoodName.toLowerCase();

  console.log("Searching for household units:", {
    inputUnit,
    searchFoodName: searchFoodLower,
    availableFoods: usdaFoods.map((f) => ({
      description: f.description,
      householdServing: f.householdServingFullText,
    })),
  });

  // Find foods that match both the household serving text and the food description
  const matchingFoods = usdaFoods.filter((food) => {
    if (!food.householdServingFullText || !food.description) return false;

    const servingText = food.householdServingFullText.toLowerCase();
    const description = food.description.toLowerCase();

    // Check if the serving text contains the unit (e.g., "slice", "slices")
    const hasMatchingServing =
      servingText.includes(inputUnit.toLowerCase()) ||
      servingText.includes(inputUnit.toLowerCase() + "s");

    // Check if the description contains the food name (more flexible matching)
    const searchTerms = searchFoodLower
      .split(" ")
      .filter((term) => term.length > 2);
    const hasMatchingDescription = searchTerms.some((term) =>
      description.includes(term)
    );

    console.log("Checking food:", {
      description: food.description,
      householdServing: food.householdServingFullText,
      hasMatchingServing,
      hasMatchingDescription,
    });

    return hasMatchingServing && hasMatchingDescription;
  });

  matchingFoods.sort((a, b) => {
    const aMatch = a.householdServingFullText.match(/(\d+(?:\.\d+)?)/);
    const bMatch = b.householdServingFullText.match(/(\d+(?:\.\d+)?)/);

    if (aMatch && bMatch) {
      return parseFloat(aMatch[1]) - parseFloat(bMatch[1]);
    }
    return 0;
  });

  return matchingFoods;
}

function extractServingQuantity(householdServingText, inputUnit) {
  let servingQuantity = 1; // Default to 1

  // Handle different formats:
  // 1. "2 slices" -> servingQuantity = 2
  // 2. "0.2 PIZZA | SLICE," -> servingQuantity = 1 (because 0.2 pizza = 1 slice)
  // 3. "1 slice" -> servingQuantity = 1
  // 4. "1 PKG, 3 PIECES" -> servingQuantity = 3 (for piece unit)

  if (householdServingText.includes("|")) {
    // Format like "0.2 PIZZA | SLICE," - this means 0.2 pizza = 1 slice
    // So if user wants 1 slice, we use 1 as serving quantity
    servingQuantity = 1;
  } else {
    // Try to find the number that corresponds to the input unit
    // For "1 PKG, 3 PIECES" and inputUnit "piece", we want to find "3 PIECES"
    const inputUnitLower = inputUnit.toLowerCase();
    const inputUnitPlural = inputUnitLower + "s";

    // Look for patterns like "3 PIECES", "2 SLICES", etc.
    const unitPattern = new RegExp(
      `(\\d+(?:\\.\\d+)?)\\s*(${inputUnitLower}|${inputUnitPlural})`,
      "i"
    );
    const unitMatch = householdServingText.match(unitPattern);

    if (unitMatch) {
      // Found a match for the specific unit
      servingQuantity = parseFloat(unitMatch[1]);
    } else {
      // Fallback: extract the first number (original behavior)
      const servingMatch = householdServingText.match(
        /(\d+(?:\.\d+)?)\s*(\w+)/i
      );
      if (servingMatch) {
        servingQuantity = parseFloat(servingMatch[1]);
      }
    }
  }

  return servingQuantity;
}

function handleHouseholdUnitConversion(
  matchingFoods,
  inputQuantity,
  inputUnit
) {
  if (matchingFoods.length === 0) {
    console.log("No matching foods found, using fallback");
    return null;
  }

  // Use the first matching food's serving information
  const matchedFood = matchingFoods[0];
  const householdServingText = matchedFood.householdServingFullText;

  console.log("Using matched food:", {
    description: matchedFood.description,
    householdServing: householdServingText,
    servingSize: matchedFood.servingSize,
  });

  const servingQuantity = extractServingQuantity(
    householdServingText,
    inputUnit
  );

  // Calculate multiplier: if USDA says "2 slices" and user wants "1 slice",
  // then multiplier = 1/2 = 0.5 (so we multiply calories by 0.5)
  const multiplier = inputQuantity / servingQuantity;

  console.log("Calculation:", {
    inputQuantity,
    servingQuantity,
    multiplier,
    convertedQuantity: matchedFood.servingSize * multiplier,
    convertedUnit: matchedFood.servingSizeUnit || "g",
    matchedFood: matchedFood.description,
    householdServing: householdServingText,
  });

  return {
    multiplier,
    convertedQuantity: matchedFood.servingSize * multiplier,
    convertedUnit: matchedFood.servingSizeUnit || "g",
    matchedFood: matchedFood.description,
    householdServing: householdServingText,
    servingQuantity: servingQuantity,
  };
}

// Atlas Search Conversion Function (for database results)
async function convertAtlasSearchToBaseUnit(
  inputQuantity,
  inputUnit,
  baseServingSize,
  baseServingUnit,
  searchFoodName = null,
  originalFoodName = null
) {
  // If no input unit, treat as quantity multiplier (e.g., "4 sandwiches")
  if (!inputUnit) {
    return {
      multiplier: inputQuantity,
      convertedQuantity: inputQuantity * baseServingSize,
      convertedUnit: baseServingUnit,
    };
  }

  // Handle known units (metric units) - keep existing functionality
  if (knownUnits.includes(inputUnit)) {
    return handleKnownUnitConversion(
      inputQuantity,
      inputUnit,
      baseServingSize,
      baseServingUnit
    );
  }

  // For household units in Atlas search, we don't have USDA foods to search through
  // So we fall back to Edamam API
  if (unknownUnits.includes(inputUnit)) {
    const edamam_response = await getEdamamNutritionData(
      originalFoodName || searchFoodName
    );
    return edamam_response;
  }

  // Default fallback
  return {
    multiplier: inputQuantity,
    convertedQuantity: inputQuantity * baseServingSize,
    convertedUnit: baseServingUnit,
  };
}

// API Conversion Function (for external API results)
async function convertApiToBaseUnit(
  inputQuantity,
  inputUnit,
  baseServingSize,
  baseServingUnit,
  usdaFoods = null,
  searchFoodName = null,
  originalFoodName = null
) {
  console.log("convertApiToBaseUnit called with:", {
    inputQuantity,
    inputUnit,
    baseServingSize,
    baseServingUnit,
    usdaFoodsCount: usdaFoods ? usdaFoods.length : 0,
    searchFoodName,
    originalFoodName
  });

  // ============================================================================
  // CASE 1: No input unit - treat as quantity multiplier (e.g., "4 bread")
  // ============================================================================
  if (!inputUnit) {
    console.log("=== CASE 1: No input unit - quantity multiplier ===");
    console.log("Taking first response and multiplying by", inputQuantity);
    return {
      multiplier: inputQuantity,
      convertedQuantity: inputQuantity * baseServingSize,
      convertedUnit: baseServingUnit,
      matchedFood: null,
      householdServing: null,
      servingQuantity: inputQuantity,
    };
  }

  // ============================================================================
  // CASE 2: Known units (metric units) - use first response with conversions
  // ============================================================================
  if (knownUnits.includes(inputUnit)) {
    console.log("=== CASE 2: Known unit detected -", inputUnit, "===");
    console.log("Taking first response and performing unit conversions");
    return handleKnownUnitConversion(
      inputQuantity,
      inputUnit,
      baseServingSize,
      baseServingUnit
    );
  }

  // ============================================================================
  // CASE 3: Unknown units (household units) - find matching food with householdServingFullText
  // ============================================================================
  if (unknownUnits.includes(inputUnit) && usdaFoods && searchFoodName) {
    console.log("=== CASE 3: Unknown unit detected -", inputUnit, "===");
    console.log("Searching for matching food with householdServingFullText");
    
    const matchingFoods = findMatchingHouseholdFoods(
      usdaFoods,
      inputUnit,
      searchFoodName
    );
    
    if (matchingFoods.length > 0) {
      console.log("Found matching foods with household units:", matchingFoods.length);
      const conversion = handleHouseholdUnitConversion(
        matchingFoods,
        inputQuantity,
        inputUnit
      );

      if (conversion) {
        console.log("Using matched food data for household unit conversion");
        return conversion;
      }
    }

    // If no matching foods found for household units, return null to signal fallback needed
    console.log("No matching foods found with household units, signaling fallback needed");
    return null;
  }

  // ============================================================================
  // FALLBACK: Return null to signal that no conversion was possible
  // ============================================================================
  console.log("=== FALLBACK: No conversion possible ===");
  console.log("No specific handling found for input unit:", inputUnit);
  return null;
}

module.exports = {
  convertAtlasSearchToBaseUnit,
  convertApiToBaseUnit,
};
