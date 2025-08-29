const Nutrition = require("../models/Nutrition");
const { normalizeFoodName, parseFoodInput, knownUnits } = require("../utils/helpers");
const { performCompleteSearch, createHouseholdServingConversion } = require("../services/searchService");
const { searchDatabase } = require("../services/databaseSearchService");
const { searchUSDA } = require("../services/usdaSearchService");
const { searchEdamam } = require("../services/edamamSearchService");
const { extractUSDANutrition, extractEdamamNutrition } = require("../services/nutritionMappingService");
const pluralize = require("pluralize");


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
    
    // Only add household serving info for Case 1 (no input unit) or Case 3 (unknown units)
    if (conversion && conversion.householdServing) {
      const { unknownUnits } = require("../utils/helpers");
      
      // Case 1: No input unit (e.g., "5 milk") - add as "default"
      if (!parsedInput?.quantity) {
        // For Edamam, use the originalServingSize (totalWeight), for USDA use conversion values
        let servingSize;
        if (dbSource === 'edamam') {
          servingSize = originalServingSize; // This is totalWeight from Edamam
        } else {
          // For USDA, we need to calculate the weight per unit
          if (conversion.matchedServingSize && conversion.servingQuantity) {
            servingSize = conversion.matchedServingSize / conversion.servingQuantity;
          } else {
            servingSize = conversion.matchedServingSize || conversion.servingQuantity || 1;
          }
        }
        
        // Check if this household serving already exists
        const existingServing = existingRecord.householdServings.find(serving => 
          serving.servingUnit === "default" && serving.servingSize === servingSize
        );
        
        if (!existingServing) {
          // Add new household serving
          existingRecord.householdServings.push({
            servingSize: servingSize,
            servingUnit: "default",
          });
          
          await existingRecord.save();
          console.log("Added new household serving to existing record");
        } else {
          console.log("Household serving already exists in record");
        }
      }
      // Case 3: Unknown units (household units like "slice", "cup", etc.) - add the household unit
      else if (parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)) {
        // For Edamam, use the originalServingSize (totalWeight), for USDA use conversion values
        let servingSize;
        if (dbSource === 'edamam') {
          servingSize = originalServingSize; // This is totalWeight from Edamam
        } else {
          // For USDA, we need to calculate the weight per unit
          if (conversion.matchedServingSize && conversion.servingQuantity) {
            servingSize = conversion.matchedServingSize / conversion.servingQuantity;
          } else {
            servingSize = conversion.matchedServingSize || conversion.servingQuantity || 1;
          }
        }
        
        // Check if this household serving already exists
        const existingServing = existingRecord.householdServings.find(serving => 
          serving.servingUnit === parsedInput.quantity && serving.servingSize === servingSize
        );
        
        if (!existingServing) {
          // Add new household serving
          existingRecord.householdServings.push({
            servingSize: servingSize,
            servingUnit: parsedInput.quantity,
          });
          
          await existingRecord.save();
          console.log("Added new household serving to existing record");
        } else {
          console.log("Household serving already exists in record");
        }
      }
      // Case 2: Known units (ml, g, kg, etc.) - don't add household servings
      else if (parsedInput?.quantity) {
        console.log("Skipping household serving for known unit:", parsedInput.quantity);
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

function createStorageName(cleanSearchTerm) {
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
  
  // Only add household servings for Case 1 (no input unit) or Case 3 (unknown units)
  if (conversion && conversion.householdServing) {
    const { unknownUnits } = require("../utils/helpers");
    
    // Case 1: No input unit (e.g., "5 milk") - always add as "default"
    if (!parsedInput?.quantity) {
      // Extract serving size and unit from householdServing text
      let servingSize;
      if (source === 'edamam') {
        servingSize = originalServingSize; // This is totalWeight from Edamam
      } else {
        // For USDA, we need to calculate the weight per unit
        if (conversion.matchedServingSize && conversion.servingQuantity) {
          servingSize = conversion.matchedServingSize / conversion.servingQuantity;
        } else {
          servingSize = conversion.matchedServingSize || conversion.servingQuantity || 1;
        }
      }
      
      householdServings.push({
        servingSize: servingSize,
        servingUnit: "default",
      });
    }
    // Case 3: Unknown units (household units like "slice", "cup", etc.)
    else if (parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)) {
      // Extract serving size and unit from householdServing text
      let servingSize;
      if (source === 'edamam') {
        servingSize = originalServingSize; // This is totalWeight from Edamam
      } else {
        // For USDA, we need to calculate the weight per unit
        if (conversion.matchedServingSize && conversion.servingQuantity) {
          servingSize = conversion.matchedServingSize / conversion.servingQuantity;
        } else {
          servingSize = conversion.matchedServingSize || conversion.servingQuantity || 1;
        }
      }
      
      householdServings.push({
        servingSize: servingSize,
        servingUnit: parsedInput.quantity,
      });
    }
    // Case 2: Known units (ml, g, kg, etc.) - don't add household servings
    else if (parsedInput?.quantity) {
      console.log("Skipping household serving for known unit:", parsedInput.quantity);
    }
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
    // PERFORM COMPLETE SEARCH (Database → Edamam → USDA)
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

      // Nutrition data is stored per 1g, so we need to apply proper conversion
      
      // Check if we have household servings and should use them
      const hasHouseholdServings = atlasSearchResults[0].householdServings && 
        Array.isArray(atlasSearchResults[0].householdServings) && 
        atlasSearchResults[0].householdServings.length > 0;
      
      let conversion = null;
      
      // Check if this is a known unit (Case 2) or unknown unit (Case 3)
      const isKnownUnit = parsedInput?.quantity && knownUnits.includes(parsedInput.quantity);
      
      if (hasHouseholdServings) {
        // Try to use household serving conversion (Case 1 or Case 3)
        conversion = createHouseholdServingConversion(quantity, parsedInput, atlasSearchResults[0]);
        
        if (!conversion) {
          // No matching household serving found, need to go to APIs
          console.log("No matching household serving found, falling back to APIs");
          throw new Error("No matching household serving found");
        }
      } else if (isKnownUnit) {
        // Case 2: Known unit with no household servings - use direct conversion
        console.log("Case 2: Known unit with no household servings, using direct conversion");
        
        // Use the base unit converter to handle known unit conversion
        const { convertAtlasSearchToBaseUnit } = require("../utils/baseUnitConverter");
        conversion = await convertAtlasSearchToBaseUnit(
          quantity,
          parsedInput.quantity,
          atlasSearchResults[0].baseServingSize,
          atlasSearchResults[0].baseServingUnit
        );
        
        if (!conversion) {
          // Fallback to simple multiplication
          conversion = {
            convertedQuantity: quantity,
            convertedUnit: parsedInput.quantity,
            householdServing: null,
            matchedFood: null
          };
          console.log("Using simple multiplication as fallback");
        }
      } else {
        // Case 3: Unknown unit but no household servings available, need to go to APIs
        console.log("Case 3: Unknown unit with no household servings, falling back to APIs");
        throw new Error("No household servings available for unknown unit");
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
    const storageName = createStorageName(cleanSearchTerm);
    
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
     
     await saveNutritionData(storageName, nutritionDataToSave, conversion, dbSource, originalServingSize, originalServingUnit, parsedInput);

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

const getBulkNutrition = async (req, res) => {
  try {
    const { foodItems } = req.body;

    if (!foodItems || !Array.isArray(foodItems)) {
      return res.status(400).json({
        status: "error",
        message: "foodItems array is required"
      });
    }

    const results = [];
    const errors = [];

    for (const item of foodItems) {
      try {
        const { name, quantity, unit } = item;
        
        if (!name) {
          errors.push({
            name: name || 'unknown',
            error: "Food name is required"
          });
          continue;
        }

        const quantityNum = parseFloat(quantity) || 1;
        const foodName = unit ? `${quantityNum} ${unit} ${name}` : `${quantityNum} ${name}`;

        // Use improved normalization for database search
        const cleanSearchTerm = normalizeFoodName(name);
        console.log("Searching for:", cleanSearchTerm);

        // Try database first
        const databaseResult = await searchDatabase(cleanSearchTerm, { number: quantityNum, quantity: unit, food: name });
        console.log("Database result:", databaseResult);
                 if (databaseResult && databaseResult.success && databaseResult.selectedResult && databaseResult.selectedResult.nutrients) {
          // Check if we have household servings and should use them
          const hasHouseholdServings = databaseResult.selectedResult.householdServings && 
            Array.isArray(databaseResult.selectedResult.householdServings) && 
            databaseResult.selectedResult.householdServings.length > 0;
          
          let conversion = null;
          let multiplier = quantityNum;
          
          // Check if this is a known unit (Case 2) or unknown unit (Case 3)
          const { knownUnits } = require("../utils/helpers");
          const isKnownUnit = unit && knownUnits.includes(unit);
          
          if (hasHouseholdServings) {
            // Try to use household serving conversion (Case 1 or Case 3)
            const { createHouseholdServingConversion } = require("../services/databaseSearchService");
            conversion = await createHouseholdServingConversion(quantityNum, { number: quantityNum, quantity: unit, food: name }, databaseResult.selectedResult);
            
            console.log("Household serving conversion:", conversion);
            console.log("Database result household servings:", databaseResult.selectedResult.householdServings);
            console.log("Parsed input for conversion:", { number: quantityNum, quantity: unit, food: name });
            
            if (conversion) {
              multiplier = conversion.multiplier;
            } else {
              // No matching household serving found, need to go to APIs
              console.log("No matching household serving found, falling back to APIs");
              // Don't throw error - let it fall through to API search
              // Remove the throw statement to allow fallback to APIs
            }
          } else if (isKnownUnit) {
            // Case 2: Known unit with no household servings - use direct conversion
            console.log("Case 2: Known unit with no household servings, using direct conversion");
            
            // Use the base unit converter to handle known unit conversion
            const { convertAtlasSearchToBaseUnit } = require("../utils/baseUnitConverter");
            conversion = await convertAtlasSearchToBaseUnit(
              quantityNum,
              unit,
              databaseResult.selectedResult.baseServingSize,
              databaseResult.selectedResult.baseServingUnit
            );
            
            if (conversion) {
              multiplier = conversion.convertedQuantity;
              console.log("Direct conversion result:", conversion);
            } else {
              // Fallback to simple multiplication
              multiplier = quantityNum;
              console.log("Using simple multiplication as fallback");
            }
          } else {
            // Case 3: Unknown unit but no household servings available, need to go to APIs
            console.log("Case 3: Unknown unit with no household servings, falling back to APIs");
            throw new Error("No household servings available for unknown unit");
          }
         
         // Only proceed with database calculation if we have a valid conversion
         if (conversion && multiplier !== undefined) {
           console.log("Using multiplier:", multiplier, "for food:", foodName);
           
           const calculatedNutrients = {};
           Object.keys(databaseResult.selectedResult.nutrients).forEach(nutrient => {
             const originalValue = databaseResult.selectedResult.nutrients[nutrient];
             const calculatedValue = originalValue * multiplier;
             calculatedNutrients[nutrient] = calculatedValue;
             console.log(`${nutrient}: ${originalValue} * ${multiplier} = ${calculatedValue}`);
           });

           results.push({
             name: foodName,
             ...calculatedNutrients,
             source: "database"
           });
           continue;
         } else {
           console.log("No valid conversion found, falling back to APIs");
         }
       }

        // If not in database, try Edamam API first
        console.log("Bulk API - Trying Edamam API for:", name, "with parsed input:", { number: quantityNum, quantity: unit, food: name });
        const edamamResult = await searchEdamam(quantityNum, { number: quantityNum, quantity: unit, food: name }, name, `${quantityNum} ${unit ? unit + ' ' : ''}${name}`);
        
        if (edamamResult.success) {
          const mappedNutrition = extractEdamamNutrition(edamamResult.nutritionData.response);
          const calculatedNutrition = {};
          
          Object.keys(mappedNutrition).forEach(nutrient => {
            calculatedNutrition[nutrient] = mappedNutrition[nutrient] * edamamResult.conversion.multiplier;
          });

          // Save to database - convert unit to singular form for proper household serving storage
          const singularUnit = unit ? pluralize.singular(unit) : null;
          await saveNutritionData(name, mappedNutrition, edamamResult.conversion, 'edamam', edamamResult.nutritionData.response.totalWeight, 'g', { number: quantityNum, quantity: singularUnit, food: name });

          results.push({
            name: foodName,
            ...calculatedNutrition,
            source: "edamam"
          });
          continue;
        }

        // If Edamam fails or returns 400 errors, try USDA API
        console.log("Bulk API - Edamam failed, trying USDA API for:", name, "with parsed input:", { number: quantityNum, quantity: unit, food: name });
        const usdaResult = await searchUSDA(quantityNum, { number: quantityNum, quantity: unit, food: name }, name, `${quantityNum} ${unit ? unit + ' ' : ''}${name}`);
        
        if (usdaResult.success) {
          console.log("USDA result conversion:", usdaResult.conversion);
          console.log("USDA result nutrition data:", usdaResult.nutritionData.response);
          
          const mappedNutrition = extractUSDANutrition(usdaResult.nutritionData.response);
          console.log("Mapped nutrition (per 1g):", mappedNutrition);
          
          const calculatedNutrition = {};
          const multiplier = usdaResult.conversion.multiplier;
          console.log("Using multiplier:", multiplier, "for food:", foodName);
          
          Object.keys(mappedNutrition).forEach(nutrient => {
            const originalValue = mappedNutrition[nutrient];
            const calculatedValue = originalValue * multiplier;
            calculatedNutrition[nutrient] = calculatedValue;
            console.log(`${nutrient}: ${originalValue} * ${multiplier} = ${calculatedValue}`);
          });

          // Save to database - convert unit to singular form for proper household serving storage
          const singularUnit = unit ? pluralize.singular(unit) : null;
          await saveNutritionData(name, mappedNutrition, usdaResult.conversion, 'usda', usdaResult.nutritionData.response.servingSize, usdaResult.nutritionData.response.servingSizeUnit, { number: quantityNum, quantity: singularUnit, food: name });

          results.push({
            name: foodName,
            ...calculatedNutrition,
            source: "usda"
          });
          continue;
        }

        // If all searches fail
        errors.push({
          name: foodName,
          error: "No nutrition data found"
        });

      } catch (error) {
        console.error(`Error processing food item ${item.name}:`, error);
        errors.push({
          name: item.name,
          error: error.message
        });
      }
    }

    if (results.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No nutrition data found for any of the provided food items",
        errors: errors
      });
    }

    res.status(200).json({
      status: "success",
      data: results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error("Bulk nutrition error:", error);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: error.message
    });
  }
};

module.exports = {
  getNutrition,
  getAllNutrition,
  getBulkNutrition,
};
