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
  "cup",
  "plate",
  "litre",
  "glass",
  "slice",
  "piece",
  "bowl",
  "bottle",
  "ml",
  "g",
  "kg",
  "mg",
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

  if (possibleUnit && knownUnits.includes(pluralize.singular(possibleUnit))) {
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

// Function to convert input quantity to base unit for proper calculation
function convertToBaseUnit(
  inputQuantity,
  inputUnit,
  baseServingSize,
  baseServingUnit
) {
  // If no input unit, treat as quantity multiplier (e.g., "4 sandwiches")
  if (!inputUnit) {
    return {
      multiplier: inputQuantity,
      convertedQuantity: inputQuantity * baseServingSize,
      convertedUnit: baseServingUnit,
    };
  }

  // Convert input to base unit for calculation
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
  } else if (inputUnit === "cup" && baseServingUnit === "ml") {
    // 1 cup = 240ml
    const cupInMl = inputQuantity * 240;
    multiplier = cupInMl / baseServingSize;
    convertedQuantity = cupInMl;
    convertedUnit = "ml";
  } else if (inputUnit === "plate" && baseServingUnit === "g") {
    // For plates, assume 1 plate = 1 base serving
    multiplier = inputQuantity;
    convertedQuantity = inputQuantity * baseServingSize;
    convertedUnit = "g";
  } else if (inputUnit === "slice" && baseServingUnit === "g") {
    // For slices, assume 1 slice = 1 base serving
    multiplier = inputQuantity;
    convertedQuantity = inputQuantity * baseServingSize;
    convertedUnit = "g";
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
    const tokens = cleanSearchTerm.trim().split(/\s+/);
    const mustClauses = tokens.map((token) => ({
      text: {
        query: token,
        path: "name",
        fuzzy: {
          maxEdits: 2,
        },
      },
    }));

    atlasSearchResults = await Nutrition.aggregate([
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

    console.log(
      "Token search results:",
      atlasSearchResults.map((r) => r.name)
    );

    console.log(
      "Atlas search results:",
      atlasSearchResults.map((r) => r.name)
    );

    // Filter results to ensure relevance and prioritize shorter, generic names
    if (atlasSearchResults.length > 0) {
      const filteredResults = atlasSearchResults.filter((result) => {
        const resultName = result.name.toLowerCase();
        const searchTerms = cleanSearchTerm.toLowerCase().split(" ");

        // Check if the result name contains the main search terms
        return searchTerms.some((term) => {
          return resultName.includes(term) && term.length > 2;
        });
      });

      // Use filtered results if available, otherwise use original results
      if (filteredResults.length > 0) {
        // Sort by name length to prioritize shorter, more generic names
        filteredResults.sort((a, b) => a.name.length - b.name.length);
        atlasSearchResults.length = 0;
        atlasSearchResults.push(...filteredResults);
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
      const conversion = convertToBaseUnit(
        quantity,
        parsedInput?.quantity,
        baseServingSize,
        baseServingUnit
      );

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
    const nutritionData = await getNutritionData(searchFoodName);
    const nutritionInfo = nutritionData.response;

    if (!nutritionInfo) {
      throw new Error("No nutrition information found from APIs.");
    }
    nutritionInfo.edamam = !!nutritionData.edamam;

    const nutrition = new Nutrition({
      name: cleanSearchTerm, // Always save normalized name!
      nutrients: nutritionInfo,
      servingSize: nutritionInfo.servingSize || 1,
      servingSizeUnit: nutritionInfo.servingSizeUnit || "g",
    });

    await nutrition.save();

    // Calculate totals for display if quantity > 1
    if (quantity > 1) {
      const calculatedNutritionInfo = { ...nutritionInfo };

      // Calculate proper multiplier based on units
      const baseServingSize = nutritionInfo.servingSize || 1;
      const baseServingUnit = nutritionInfo.servingSizeUnit || "g";
      const conversion = convertToBaseUnit(
        quantity,
        parsedInput?.quantity,
        baseServingSize,
        baseServingUnit
      );

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
      });
    } else {
      res.status(200).json({
        ...nutritionData,
        fromApi: true,
        parsedInput: parsedInput,
        quantity: quantity,
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
