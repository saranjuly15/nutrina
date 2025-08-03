const { getNutritionData } = require("../services/externalApiServices");
const Nutrition = require("../models/Nutrition");
const pluralize = require("pluralize");

function normalizeFoodName(name) {
  let clean = name
    .toLowerCase()
    .replace(/^[0-9]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.endsWith("ies") && clean.length > 4) {
    clean = clean.slice(0, -3) + "y";
  } else if (
    (clean.endsWith("ses") ||
      clean.endsWith("xes") ||
      clean.endsWith("zes") ||
      clean.endsWith("ches") ||
      clean.endsWith("shes")) &&
    clean.length > 4
  ) {
    clean = clean.slice(0, -2);
  } else if (clean.endsWith("s") && !clean.endsWith("ss") && clean.length > 4) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

const knownUnits = [
  "ml",
  "g",
  "kg",
  "mg",
  "litre",
];

const unknownUnits = [
  "cup",
  "plate",
  "glass",
  "slice",
  "piece",
  "bowl",
  "bottle",
  "dozen",
];

function parseFoodInput(input) {
  input = input.trim().toLowerCase();

  const regex = /^(\d+(?:\.\d+)?)\s*(\w+)?(?:\s+of)?\s+(.*)$/;
  const match = input.match(regex);

  if (!match) return null;

  const number = parseFloat(match[1]);
  const possibleUnit = match[2];
  const rest = match[3].trim();

  let quantity = null;
  let food = "";

  if (possibleUnit && (knownUnits.includes(pluralize.singular(possibleUnit)) || unknownUnits.includes(pluralize.singular(possibleUnit)))) {
    quantity = pluralize.singular(possibleUnit);
    food = pluralize.singular(rest);
  } else {
    quantity = null;
    const combined = (possibleUnit ? possibleUnit + " " : "") + rest;
    food = pluralize.singular(combined.trim());
  }

  return {
    number,
    quantity,
    food,
  };
}
function convertToBaseUnit(
  inputQuantity,
  inputUnit,
  baseServingSize,
  baseServingUnit,
  usdaFoods = null,
  searchFoodName = null
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
    };
  }

  // Handle unknown units (household units) - search USDA for matching householdServingFullText
  if (unknownUnits.includes(inputUnit) && usdaFoods && searchFoodName) {
    const searchFoodLower = searchFoodName.toLowerCase();
    
    console.log("Searching for household units:", {
      inputUnit,
      searchFoodName: searchFoodLower,
      availableFoods: usdaFoods.map(f => ({
        description: f.description,
        householdServing: f.householdServingFullText
      }))
    });
    
    // Find foods that match both the household serving text and the food description
    const matchingFoods = usdaFoods.filter(food => {
      if (!food.householdServingFullText || !food.description) return false;
      
      const servingText = food.householdServingFullText.toLowerCase();
      const description = food.description.toLowerCase();
      
      // Check if the serving text contains the unit (e.g., "slice", "slices")
      const hasMatchingServing = servingText.includes(inputUnit.toLowerCase()) || 
                                 servingText.includes(inputUnit.toLowerCase() + 's');
      
      // Check if the description contains the food name (more flexible matching)
      const searchTerms = searchFoodLower.split(' ').filter(term => term.length > 2);
      const hasMatchingDescription = searchTerms.some(term => description.includes(term));
      
      console.log("Checking food:", {
        description: food.description,
        householdServing: food.householdServingFullText,
        hasMatchingServing,
        hasMatchingDescription
      });
      
      return hasMatchingServing && hasMatchingDescription;
    });

    // Sort by relevance - prefer foods with multiple units (e.g., "2 slices" over "1 slice")
    matchingFoods.sort((a, b) => {
      const aMatch = a.householdServingFullText.match(/(\d+(?:\.\d+)?)/);
      const bMatch = b.householdServingFullText.match(/(\d+(?:\.\d+)?)/);
      
      if (aMatch && bMatch) {
        return parseFloat(bMatch[1]) - parseFloat(aMatch[1]); // Higher numbers first
      }
      return 0;
    });

    console.log("Matching foods found:", matchingFoods.length);
    
    if (matchingFoods.length > 0) {
      // Use the first matching food's serving information
      const matchedFood = matchingFoods[0];
      const householdServingText = matchedFood.householdServingFullText;
      
      console.log("Using matched food:", {
        description: matchedFood.description,
        householdServing: householdServingText,
        servingSize: matchedFood.servingSize
      });
      
      // Extract number from householdServingFullText (e.g., "2 slices" -> 2)
      const servingMatch = householdServingText.match(/(\d+(?:\.\d+)?)\s*(\w+)/i);
      
      if (servingMatch) {
        const servingQuantity = parseFloat(servingMatch[1]);
        
        // Calculate multiplier: if USDA says "2 slices" and user wants "1 slice", 
        // then multiplier = 1/2 = 0.5 (so we multiply calories by 0.5)
        const multiplier = (inputQuantity / servingQuantity);
        
        console.log("Calculation:", {
          inputQuantity,
          servingQuantity,
          multiplier,
          convertedQuantity: matchedFood.servingSize * multiplier
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
    }
    
    console.log("No matching foods found, using fallback");
  }

  // Default fallback for unknown units
  console.log("Using fallback calculation:", {
    inputQuantity,
    baseServingSize,
    multiplier: inputQuantity,
    convertedQuantity: inputQuantity * baseServingSize
  });
  
  return {
    multiplier: inputQuantity,
    convertedQuantity: inputQuantity * baseServingSize,
    convertedUnit: baseServingUnit,
  };
}

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
    const unit = parsedInput ? parsedInput.quantity : null;

    // Use improved normalization
    const cleanSearchTerm = normalizeFoodName(searchFoodName);
    console.log("Searching for:", cleanSearchTerm);
    
    // Always search for the base food name
    let searchTerms = [cleanSearchTerm];
    
    // Also search for old naming pattern during transition period
    if (parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)) {
      const oldPatternSearchTerm = `${cleanSearchTerm}_${parsedInput.quantity}`;
      searchTerms.push(oldPatternSearchTerm);
      
      // Also try with the full household serving text pattern
      const oldPatternWithServing = `${cleanSearchTerm}_2_${parsedInput.quantity.toUpperCase()}S`;
      searchTerms.push(oldPatternWithServing);
    }
    
    // Debug: Log what we're searching for
    console.log("Search debug:", {
      originalQuery: foodName,
      parsedInput: parsedInput,
      cleanSearchTerm: cleanSearchTerm,
      searchTerms: searchTerms,
      hasHouseholdUnit: parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)
    });

    // // First try exact match
    // let atlasSearchResults = await Nutrition.aggregate([
    //   {
    //     $search: {
    //       index: "default",
    //       text: {
    //         query: cleanSearchTerm,
    //         path: "name",
    //       },
    //     },
    //   },
    //   {
    //     $limit: 5,
    //   },
    // ]);

    // console.log(
    //   "Exact search results:",
    //   atlasSearchResults.map((r) => r.name)
    // );

    // If no exact match, try token-based search
    // if (atlasSearchResults.length === 0) {
    let atlasSearchResults = [];
    
    // Try searching for each search term
    for (const searchTerm of searchTerms) {
      const tokens = searchTerm.trim().split(/\s+/);
      const mustClauses = tokens.map((token) => ({
        text: {
          query: token,
          path: "name",
          fuzzy: {
            maxEdits: 2,
          },
        },
      }));

      const results = await Nutrition.aggregate([
        {
          $search: {
            index: "default",
            compound: {
              must: mustClauses,
            },
          },
        },
        {
          $limit: 10,
        },
      ]);
      
      atlasSearchResults.push(...results);
    }
    
    // Remove duplicates based on _id
    const uniqueResults = [];
    const seenIds = new Set();
    for (const result of atlasSearchResults) {
      if (!seenIds.has(result._id.toString())) {
        seenIds.add(result._id.toString());
        uniqueResults.push(result);
      }
    }
    atlasSearchResults = uniqueResults;

    console.log(
      "Token search results:",
      atlasSearchResults.map((r) => r.name)
    );

    console.log(
      "Atlas search results:",
      atlasSearchResults.map((r) => r.name)
    );

    // Filter results to ensure relevance and prioritize the correct match
    if (atlasSearchResults.length > 0) {
      // First, try to find an exact match for household units
      if (parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)) {
        // Look for items with household serving info that matches the unit
        const householdMatches = atlasSearchResults.filter(result => 
          result.householdServingInfo && 
          result.householdServingInfo.householdServing &&
          result.householdServingInfo.householdServing.toLowerCase().includes(parsedInput.quantity.toLowerCase())
        );
        
        if (householdMatches.length > 0) {
          console.log("Found household matches:", householdMatches.map(r => r.name));
          // Prioritize household matches over base items
          atlasSearchResults = householdMatches;
        } else {
          console.log("No household matches found for household units, will search API");
          // If searching for household units but no household items found, 
          // don't use base items - let it fall through to API search
          atlasSearchResults = [];
        }
      } else {
        // For non-household units, filter for base food name (items without household serving info)
        const filteredResults = atlasSearchResults.filter((result) => {
          const resultName = result.name.toLowerCase();
          const baseSearchTerms = cleanSearchTerm.toLowerCase().split(" ");
          
          // Only include items that DON'T have household serving info
          const hasNoHouseholdInfo = !result.householdServingInfo;

          // Check if the result name contains the main search terms
          const hasMatchingTerms = baseSearchTerms.some((term) => {
            return resultName.includes(term) && term.length > 2;
          });

          return hasMatchingTerms && hasNoHouseholdInfo;
        });

        if (filteredResults.length > 0) {
          // Sort by name length to prioritize shorter, more generic names
          filteredResults.sort((a, b) => a.name.length - b.name.length);
          atlasSearchResults = filteredResults;
        }
      }
    }

    console.log("Final selected result:", atlasSearchResults[0]?.name);

    // If found using Atlas search, return the first match and DO NOT save a new entry
    if (atlasSearchResults.length > 0) {
      const nutrients = { ...atlasSearchResults[0].nutrients };

      // Calculate proper multiplier based on units
      const baseServingSize =
        atlasSearchResults[0].servingSize || nutrients.servingSize || 1;
      const baseServingUnit =
        atlasSearchResults[0].servingSizeUnit ||
        nutrients.servingSizeUnit ||
        "g";
                     // Use stored household serving info if available
        let conversion;
        if (atlasSearchResults[0].householdServingInfo && parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)) {
          // Use stored household serving information
          const householdInfo = atlasSearchResults[0].householdServingInfo;
          const servingQuantity = householdInfo.servingQuantity;
          const multiplier = (quantity / servingQuantity);
          
          conversion = {
            multiplier,
            convertedQuantity: baseServingSize * multiplier,
            convertedUnit: baseServingUnit,
            matchedFood: householdInfo.matchedFood,
            householdServing: householdInfo.householdServing,
            servingQuantity: servingQuantity,
          };
        } else {
          // Use regular conversion for known units or no unit
          conversion = convertToBaseUnit(
            quantity,
            parsedInput?.quantity,
            baseServingSize,
            baseServingUnit,
            null, // No USDA foods for Atlas search results
            searchFoodName
          );
        }

      if (conversion.multiplier !== 1) {
        if (nutrients.calories) nutrients.calories *= conversion.multiplier;
        if (nutrients.totalWeight)
          nutrients.totalWeight *= conversion.multiplier;
        if (nutrients.servingSize)
          nutrients.servingSize = conversion.convertedQuantity;

        if (nutrients.foodNutrients && Array.isArray(nutrients.foodNutrients)) {
          nutrients.foodNutrients = nutrients.foodNutrients.map((nutrient) => ({
            ...nutrient,
            value: nutrient.value * conversion.multiplier,
          }));
        }
      }

      return res.status(200).json({
        ...nutrients,
        fromDatabase: true,
        searchMethod: "atlas",
        parsedInput: parsedInput,
        quantity: quantity,
        searchResults: atlasSearchResults.map((r) => r.name),
        conversion: conversion,
      });
    }

    // COMMENTED OUT REGEX SEARCH CODE (for potential reuse)
    /*
    const words = cleanSearchTerm.split(' ');

    // Build AND regex for all words (whole word, any order)
    const andRegex = words.map(word => ({
      name: { $regex: new RegExp(`\\b${word}\\b`, 'i') }
    }));

    // Try AND regex search first
    let results = await Nutrition.find({ $and: andRegex });

    // If no results, try full phrase as a whole word
    if (results.length === 0) {
      results = await Nutrition.find({
        name: { $regex: new RegExp(`\\b${cleanSearchTerm}\\b`, 'i') }
      });
    }

    // If found, return the first match and DO NOT save a new entry
    if (results.length > 0) {
      const nutrients = { ...results[0].nutrients };
      if (quantity > 1) {
        if (nutrients.calories) nutrients.calories *= quantity;
        if (nutrients.totalWeight) nutrients.totalWeight *= quantity;
        // ...multiply other relevant fields if needed
      }
      return res.status(200).json({
        ...nutrients,
        fromDatabase: true
      });
    }
    */

    // If nothing found, fetch from API and save with normalized name
    console.log(
      "No database match found, fetching from API for:",
      searchFoodName
    );
    const nutritionData = await getNutritionData(searchFoodName, unit);
    const nutritionInfo = nutritionData.response;

    if (!nutritionInfo) {
      throw new Error("No nutrition information found from APIs.");
    }
    nutritionInfo.edamam = !!nutritionData.edamam;

    // Calculate conversion for response (but don't save multiplied values to DB)
    const baseServingSize = nutritionInfo.servingSize || 1;
    const baseServingUnit = nutritionInfo.servingSizeUnit || "g";
    const conversion = convertToBaseUnit(
      quantity,
      parsedInput?.quantity,
      baseServingSize,
      baseServingUnit,
      nutritionData.foods || null,
      searchFoodName
    );

    // Store the original serving information without applying multipliers
    // Create a unique name that includes household serving context if applicable
    let storageName = cleanSearchTerm;
    if (conversion.householdServing) {
      storageName = `${cleanSearchTerm}_${conversion.householdServing.replace(/\s+/g, '_')}`;
    }
    
    const nutrition = new Nutrition({
      name: storageName, // Include household serving context in the name
      nutrients: nutritionInfo,
      servingSize: nutritionInfo.servingSize || 1,
      servingSizeUnit: nutritionInfo.servingSizeUnit || "g",
      // Store additional information for household units
      householdServingInfo: conversion.householdServing ? {
        householdServing: conversion.householdServing,
        servingQuantity: conversion.servingQuantity,
        matchedFood: conversion.matchedFood
      } : null
    });

    await nutrition.save();

     // Calculate totals for display if quantity > 1
     if (quantity > 1) {
       const calculatedNutritionInfo = { ...nutritionInfo };

      if (calculatedNutritionInfo.calories)
        calculatedNutritionInfo.calories *= conversion.multiplier;
      if (calculatedNutritionInfo.totalWeight)
        calculatedNutritionInfo.totalWeight *= conversion.multiplier;
      if (calculatedNutritionInfo.servingSize)
        calculatedNutritionInfo.servingSize = conversion.convertedQuantity;

      if (
        calculatedNutritionInfo.foodNutrients &&
        Array.isArray(calculatedNutritionInfo.foodNutrients)
      ) {
        calculatedNutritionInfo.foodNutrients =
          calculatedNutritionInfo.foodNutrients.map((nutrient) => ({
            ...nutrient,
            value: nutrient.value * conversion.multiplier,
          }));
      }

      res.status(200).json({
        response: calculatedNutritionInfo,
        edamam: nutritionData.edamam,
        fromApi: true,
        parsedInput: parsedInput,
        quantity: quantity,
        baseNutrition: nutritionInfo,
        conversion: conversion,
      });
    } else {
      const baseServingSize = nutritionInfo.servingSize || 1;
      const baseServingUnit = nutritionInfo.servingSizeUnit || "g";
      res.status(200).json({
        ...nutritionData,
        fromApi: true,
        parsedInput: parsedInput,
        quantity: quantity,
        conversion: { multiplier: 1, convertedQuantity: baseServingSize, convertedUnit: baseServingUnit },
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
      return res.status(400).json({ message: "Query parameter is required" });
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
