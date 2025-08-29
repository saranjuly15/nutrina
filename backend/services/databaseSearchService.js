const Nutrition = require("../models/Nutrition");
const { unknownUnits } = require("../utils/helpers");
const pluralize = require("pluralize");

// ============================================================================
// DATABASE SEARCH FUNCTIONALITIES
// ============================================================================

function generateSearchTerms(cleanSearchTerm) {
  // Since we now store one record per food, we only need the base food name
  // Household servings are stored in the householdServings array
  return [cleanSearchTerm];
}

async function performAtlasSearch(searchTerms, parsedInput) {
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
  
  // If we're searching for household units, also search for entries with the same food name and unit
  if (parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)) {
    const foodName = searchTerms[0]; // The base food name
    const unit = parsedInput.quantity;
    
    // Search for entries that contain the food name and the unit
    const foodTokens = foodName.trim().split(/\s+/);
    const foodClauses = foodTokens.map((token) => ({
      text: {
        query: token,
        path: "name",
        fuzzy: {
          maxEdits: 2,
        },
      },
    }));
    
    const unitClause = {
      text: {
        query: unit,
        path: "name",
        fuzzy: {
          maxEdits: 1,
        },
      },
    };
    
    const additionalResults = await Nutrition.aggregate([
      {
        $search: {
          index: "default",
          compound: {
            must: [...foodClauses, unitClause],
          },
        },
      },
      {
        $limit: 10,
      },
    ]);
    
    atlasSearchResults.push(...additionalResults);
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
  
  return uniqueResults;
}

function filterAtlasSearchResults(atlasSearchResults, cleanSearchTerm, parsedInput) {
  if (atlasSearchResults.length === 0) return atlasSearchResults;

  // Case 1: Searching for household units (e.g., "2 cups of milk")
  if (parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)) {
    // Look for items with household serving info that matches the unit
    const householdMatches = atlasSearchResults.filter(result => 
      result.householdServings && 
      Array.isArray(result.householdServings) &&
      result.householdServings.some(serving => 
        serving.servingUnit && 
        serving.servingUnit.toLowerCase().includes(parsedInput.quantity.toLowerCase())
      )
    );
    
    if (householdMatches.length > 0) {
      console.log("Found household matches:", householdMatches.map(r => r.name));
      // Prioritize household matches over base items
      return householdMatches;
    } else {
      console.log("No household matches found for household units, will search API");
      // If searching for household units but no household items found, 
      // don't use base items - let it fall through to API search
      return [];
    }
  } 
  // Case 2: Searching for quantity without unit (e.g., "2 bread")
  else if (parsedInput?.number && !parsedInput?.quantity) {
    // Look for items with "default" household serving info
    const servingMatches = atlasSearchResults.filter(result => 
      result.householdServings && 
      Array.isArray(result.householdServings) &&
      result.householdServings.some(serving => 
        serving.servingUnit && 
        serving.servingUnit.toLowerCase() === "default"
      )
    );
    
    if (servingMatches.length > 0) {
      console.log("Found serving matches:", servingMatches.map(r => r.name));
      return servingMatches;
    } else {
      console.log("No serving matches found, will search API");
      return [];
    }
  }
  // Case 3: Searching for known units or no quantity
  else {
    // For non-household units, filter for base food name (items without household serving info)
    const filteredResults = atlasSearchResults.filter((result) => {
      const resultName = result.name.toLowerCase();
      const baseSearchTerms = cleanSearchTerm.toLowerCase().split(" ");
      
      // Only include items that DON'T have household serving info
      const hasNoHouseholdInfo = !result.householdServings || 
        !Array.isArray(result.householdServings) || 
        result.householdServings.length === 0;

      // Check if the result name contains the main search terms
      const hasMatchingTerms = baseSearchTerms.some((term) => {
        return resultName.includes(term) && term.length > 2;
      });

      return hasMatchingTerms && hasNoHouseholdInfo;
    });

    if (filteredResults.length > 0) {
      // Sort by name length to prioritize shorter, more generic names
      filteredResults.sort((a, b) => a.name.length - b.name.length);
      return filteredResults;
    }
  }
  
  return atlasSearchResults;
}

async function createHouseholdServingConversion(quantity, parsedInput, atlasSearchResult) {
  // Use the proper unit conversion logic from baseUnitConverter
  const { convertAtlasSearchToBaseUnit } = require("../utils/baseUnitConverter");
  
  // Check if we have household servings and should use them for calculation
  const hasHouseholdServings = atlasSearchResult.householdServings && 
    Array.isArray(atlasSearchResult.householdServings) && 
    atlasSearchResult.householdServings.length > 0;
  
  let baseServingSize = atlasSearchResult.baseServingSize;
  let baseServingUnit = atlasSearchResult.baseServingUnit;
  
  // If we have household servings and no input unit (Case 1), use the household serving size
  if (hasHouseholdServings && !parsedInput?.quantity) {
    // Find the "default" household serving
    const defaultServing = atlasSearchResult.householdServings.find(serving => 
      serving.servingUnit === "default"
    );
    
    if (defaultServing) {
      // Use the household serving size instead of baseServingSize
      baseServingSize = defaultServing.servingSize;
    }
  }
  // If we have household servings and the input unit matches a household serving (Case 3)
  else if (hasHouseholdServings && parsedInput?.quantity) {
    // Try exact match with singular/plural handling
    const inputUnit = parsedInput.quantity.toLowerCase();
    
    // Try exact match first
    let matchingServing = atlasSearchResult.householdServings.find(serving => 
      serving.servingUnit && serving.servingUnit.toLowerCase() === inputUnit
    );
    
    // If no exact match, try singular form
    if (!matchingServing) {
      const singularInputUnit = pluralize.singular(inputUnit);
      matchingServing = atlasSearchResult.householdServings.find(serving => 
        serving.servingUnit && serving.servingUnit.toLowerCase() === singularInputUnit
      );
    }
    
    // If still no match, try plural form
    if (!matchingServing) {
      const pluralInputUnit = pluralize.plural(inputUnit);
      matchingServing = atlasSearchResult.householdServings.find(serving => 
        serving.servingUnit && serving.servingUnit.toLowerCase() === pluralInputUnit
      );
    }
    
    if (matchingServing) {
      // Use the household serving size instead of baseServingSize
      baseServingSize = matchingServing.servingSize;
    } else {
      console.log("No matching household serving found for unit:", parsedInput.quantity);
      // Return null to signal that no matching household serving was found
      // This will trigger fallback to external APIs
      return null;
    }
  }
  
  // Convert the input using the proper unit conversion logic
  const conversion = await convertAtlasSearchToBaseUnit(
    quantity,
    parsedInput?.quantity,
    baseServingSize,
    baseServingUnit
  );
  
  return conversion;
}

// ============================================================================
// MAIN DATABASE SEARCH FUNCTION
// ============================================================================

async function searchDatabase(cleanSearchTerm, parsedInput) {
  console.log("=== DATABASE SEARCH START ===");
  console.log("Searching for:", cleanSearchTerm);
  console.log("Parsed input:", parsedInput);
  
  // Generate search terms
  const searchTerms = generateSearchTerms(cleanSearchTerm);
  console.log("Generated search terms:", searchTerms);
  
  // Perform Atlas search
  let atlasSearchResults = await performAtlasSearch(searchTerms, parsedInput);
  console.log("Raw Atlas search results count:", atlasSearchResults.length);
  
  // Filter results
  atlasSearchResults = filterAtlasSearchResults(atlasSearchResults, cleanSearchTerm, parsedInput);
  console.log("Filtered Atlas search results count:", atlasSearchResults.length);
  
  if (atlasSearchResults.length > 0) {
    console.log("=== DATABASE SEARCH SUCCESS ===");
    console.log("Found results:", atlasSearchResults.map(r => r.name));
    return {
      success: true,
      source: "database",
      results: atlasSearchResults,
      selectedResult: atlasSearchResults[0]
    };
  } else {
    console.log("=== DATABASE SEARCH NO RESULTS ===");
    return {
      success: false,
      source: "database",
      message: "No matching results found in database"
    };
  }
}

module.exports = {
  searchDatabase,
  createHouseholdServingConversion,
  generateSearchTerms,
  performAtlasSearch,
  filterAtlasSearchResults
};

