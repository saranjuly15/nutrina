const { getNutritionData } = require("../services/externalApiServices");
const Nutrition = require("../models/Nutrition");
const { normalizeFoodName, parseFoodInput, unknownUnits } = require("../utils/helpers");
const { generateSearchTerms, performAtlasSearch, filterAtlasSearchResults } = require("../models/atlasSearch");
const { convertAtlasSearchToBaseUnit, convertApiToBaseUnit } = require("../utils/baseUnitConverter");

// Nutrition Calculation Functions
function applyMultiplierToNutrients(nutrients, multiplier) {
  if (multiplier === 1) return nutrients;

  const calculatedNutrients = { ...nutrients };

  if (calculatedNutrients.calories) calculatedNutrients.calories *= multiplier;
  if (calculatedNutrients.totalWeight) calculatedNutrients.totalWeight *= multiplier;
  if (calculatedNutrients.servingSize) calculatedNutrients.servingSize *= multiplier;

  if (calculatedNutrients.foodNutrients && Array.isArray(calculatedNutrients.foodNutrients)) {
    calculatedNutrients.foodNutrients = calculatedNutrients.foodNutrients.map((nutrient) => ({
      ...nutrient,
      value: nutrient.value * multiplier,
    }));
  }

  return calculatedNutrients;
}

function createHouseholdServingConversion(quantity, parsedInput, atlasSearchResult) {
  const householdInfo = atlasSearchResult.householdServingInfo;
  const servingQuantity = householdInfo.servingQuantity;
  const multiplier = (quantity / servingQuantity);
  
  return {
    multiplier,
    convertedQuantity: atlasSearchResult.servingSize * multiplier,
    convertedUnit: atlasSearchResult.servingSizeUnit || "g",
    matchedFood: householdInfo.matchedFood,
    householdServing: householdInfo.householdServing,
    servingQuantity: servingQuantity,
  };
}

function createStorageName(cleanSearchTerm, conversion) {
  let storageName = cleanSearchTerm;
  if (conversion.householdServing) {
    storageName = `${cleanSearchTerm}_${conversion.householdServing.replace(/\s+/g, '_')}`;
  }
  // For Edamam results with household units, use the original format
  if (conversion.fromEdamam && conversion.householdServing) {
    storageName = `${cleanSearchTerm}_${conversion.servingQuantity}_${conversion.householdServing.split(' ')[1]}`;
  }
  return storageName;
}

function createNutritionDocument(storageName, finalNutritionInfo, conversion) {
  return new Nutrition({
    name: storageName,
    nutrients: finalNutritionInfo,
    servingSize: finalNutritionInfo.servingSize || finalNutritionInfo.totalWeight || 1,
    servingSizeUnit: finalNutritionInfo.servingSizeUnit || "g",
    // Store additional information for household units
    householdServingInfo: conversion.householdServing ? {
      householdServing: conversion.householdServing,
      servingQuantity: conversion.servingQuantity,
      matchedFood: conversion.matchedFood
    } : null
  });
}

function findMatchedFoodData(nutritionData, conversion) {
  if (!conversion.matchedFood || !nutritionData.foods) return null;
  
  return nutritionData.foods.find(food => 
    food.description === conversion.matchedFood
  );
}

// Main Controller Functions
const getNutrition = async (req, res) => {
  const { foodName } = req.query;

  try {
    console.log("DEBUG: Entering getNutrition function");
    console.log("DEBUG: foodName =", foodName);
    console.log("DEBUG: req.query =", req.query);
    debugger; // This should pause execution
    console.log("DEBUG: After debugger statement");
    
    if (!foodName) {
      return res.status(400).json({ message: "Food name is required" });
    }

    // Parse the input using the new parser
    const parsedInput = parseFoodInput(foodName);
  
    console.log("Parsed input:", parsedInput);

    // Extract quantity and food name
    const quantity = parsedInput ? parsedInput.number : 1;
    const searchFoodName = parsedInput ? parsedInput.food : foodName;
    const unit = parsedInput ? parsedInput.quantity : null;

    // Use improved normalization
    const cleanSearchTerm = normalizeFoodName(searchFoodName);
    console.log("Searching for:", cleanSearchTerm);
    
    // Generate search terms
    const searchTerms = generateSearchTerms(cleanSearchTerm, parsedInput);
    
    // Debug: Log what we're searching for
    console.log("Search debug:", {
      originalQuery: foodName,
      parsedInput: parsedInput,
      cleanSearchTerm: cleanSearchTerm,
      searchTerms: searchTerms,
      hasHouseholdUnit: parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)
    });

    // Perform Atlas search
    let atlasSearchResults = await performAtlasSearch(searchTerms);
    
    debugger; 
    
    console.log(
      "Atlas search results:",
      atlasSearchResults.map((r) => r.name)
    );

    // Filter results to ensure relevance and prioritize the correct match
    atlasSearchResults = filterAtlasSearchResults(atlasSearchResults, cleanSearchTerm, parsedInput);

    console.log("Final selected result:", atlasSearchResults[0]?.name);

    // If found using Atlas search, return the first match and DO NOT save a new entry
    if (atlasSearchResults.length > 0) {
      debugger; // DEBUG: Atlas search found results - inspect atlasSearchResults[0]
      const nutrients = { ...atlasSearchResults[0].nutrients };

      // Calculate proper multiplier based on units
      const baseServingSize = atlasSearchResults[0].servingSize || nutrients.servingSize || 1;
      const baseServingUnit = atlasSearchResults[0].servingSizeUnit || nutrients.servingSizeUnit || "g";
      
      // Use stored household serving info if available
      let conversion;
      if (atlasSearchResults[0].householdServingInfo && parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)) {
        // Use stored household serving information
        conversion = createHouseholdServingConversion(quantity, parsedInput, atlasSearchResults[0]);
      } else {
        // Use regular conversion for known units or no unit
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
        fromDatabase: true,
        searchMethod: "atlas",
        parsedInput: parsedInput,
        quantity: quantity,
        searchResults: atlasSearchResults.map((r) => r.name),
        conversion: conversion,
      });
    }

    // If nothing found, fetch from API and save with normalized name
    console.log(
      "No database match found, fetching from API for:",
      searchFoodName
    );
    debugger; // DEBUG: About to call external API - inspect searchFoodName and unit
    const nutritionData = await getNutritionData(searchFoodName, unit);
    const nutritionInfo = nutritionData.response;

    if (!nutritionInfo) {
      throw new Error("No nutrition information found from APIs.");
    }
    nutritionInfo.edamam = !!nutritionData.edamam;

    // Calculate conversion for response (but don't save multiplied values to DB)
    const baseServingSize = nutritionInfo.servingSize || 1;
    const baseServingUnit = nutritionInfo.servingSizeUnit || "g";
    const conversion = await convertApiToBaseUnit(
      quantity,
      parsedInput?.quantity,
      baseServingSize,
      baseServingUnit,
      nutritionData.foods || null,
      searchFoodName,
      foodName
    );
    debugger; // DEBUG: After conversion - inspect conversion object
    console.log("Conversion:", conversion);

    // Use the matchedFood data if available, otherwise use the default response
    let finalNutritionInfo = nutritionInfo;
    const matchedFoodData = findMatchedFoodData(nutritionData, conversion);
    if (matchedFoodData) {
      finalNutritionInfo = matchedFoodData;
      console.log("Using matched food data:", matchedFoodData.description);
    }
    
    // For Edamam results, use the Edamam response directly
    if (conversion.fromEdamam) {
      finalNutritionInfo = conversion.response;
      console.log("Using Edamam data for household unit:", conversion.householdServing);
    }

    // Store the original serving information without applying multipliers
    const storageName = createStorageName(cleanSearchTerm, conversion);
    const nutrition = createNutritionDocument(storageName, finalNutritionInfo, conversion);
    await nutrition.save();

    // Calculate totals for display if conversion multiplier is not 1
    if (conversion.multiplier !== 1) {
      const calculatedNutritionInfo = applyMultiplierToNutrients(finalNutritionInfo, conversion.multiplier);
      
      if(calculatedNutritionInfo.householdServingFullText){
        calculatedNutritionInfo.householdServingFullText = conversion.householdServing;
      }

      res.status(200).json({
        foods: nutritionData.foods,
        response: calculatedNutritionInfo,
        edamam: nutritionData.edamam || conversion.fromEdamam,
        fromApi: true,
        parsedInput: parsedInput,
        quantity: quantity,
        baseNutrition: finalNutritionInfo,
        conversion: conversion,
      });
    } else {
      // This block now handles cases where multiplier is 1 (e.g., 1g of food, or 1 slice where 1 slice is the base)
      res.status(200).json({
        foods: nutritionData.foods,
        response: finalNutritionInfo, // Base nutrition info (same as calculated when multiplier is 1)
        edamam: nutritionData.edamam || conversion.fromEdamam,
        fromApi: true,
        parsedInput: parsedInput,
        quantity: quantity,
        conversion: conversion, // The actual conversion object (multiplier will be 1)
      });
    }
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

// New function to test Atlas search functionality
const testAtlasSearch = async (req, res) => {
  const { query } = req.query;

  try {
    if (!query) {
      return res.status(400).json({ message: "Test Atlas Search: Query parameter is required" });
    }

    // Parse the input using the new parser
    const parsedInput = parseFoodInput(query);
    //console.log("Test - Parsed input:", parsedInput);

    // Extract food name for search
    const searchFoodName = parsedInput ? parsedInput.food : query;
    const cleanSearchTerm = normalizeFoodName(searchFoodName);

    const atlasSearchResults = await Nutrition.aggregate([
      {
        $search: {
          index: "default",
          text: {
            query: cleanSearchTerm,
            path: "name",
            fuzzy: {
              maxEdits: 1,
              prefixLength: 1,
            },
          },
        },
      },
      {
        $limit: 5,
      },
    ]);

    res.status(200).json({
      query: cleanSearchTerm,
      parsedInput: parsedInput,
      results: atlasSearchResults,
      count: atlasSearchResults.length,
      searchMethod: "atlas",
    });
  } catch (error) {
    console.error("Atlas search test error:", error);

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

module.exports = {
  getNutrition,
  getAllNutrition,
  testAtlasSearch,
};
