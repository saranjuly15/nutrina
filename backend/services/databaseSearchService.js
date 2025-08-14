const Nutrition = require("../models/Nutrition");
const { unknownUnits } = require("../utils/helpers");

// ============================================================================
// DATABASE SEARCH FUNCTIONALITIES
// ============================================================================

function generateSearchTerms(cleanSearchTerm, parsedInput) {
  let searchTerms = [cleanSearchTerm];
  
  if (parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)) {
    // Search for the generic format: foodname_unit (without quantity)
    const genericPattern = `${cleanSearchTerm}_${parsedInput.quantity}`;
    searchTerms.push(genericPattern);
    
    // Also try with the old patterns for backward compatibility
    const oldPatternSearchTerm = `${cleanSearchTerm}_${parsedInput.quantity}`;
    searchTerms.push(oldPatternSearchTerm);
    
    // Also try with the full household serving text pattern
    const oldPatternWithServing = `${cleanSearchTerm}_2_${parsedInput.quantity.toUpperCase()}S`;
    searchTerms.push(oldPatternWithServing);
  }
  
  return searchTerms;
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

  // First, try to find an exact match for household units
  if (parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)) {
    // Look for items with household serving info that matches the unit
    const householdMatches = atlasSearchResults.filter(result => 
      result.householdServing && 
      result.householdServing.servingUnit &&
      result.householdServing.servingUnit.toLowerCase().includes(parsedInput.quantity.toLowerCase())
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
  } else {
    // For non-household units, filter for base food name (items without household serving info)
    const filteredResults = atlasSearchResults.filter((result) => {
      const resultName = result.name.toLowerCase();
      const baseSearchTerms = cleanSearchTerm.toLowerCase().split(" ");
      
      // Only include items that DON'T have household serving info
      const hasNoHouseholdInfo = !result.householdServing.servingSize;

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

function createHouseholdServingConversion(quantity, parsedInput, atlasSearchResult) {
  const householdInfo = atlasSearchResult.householdServing;
  const servingQuantity = householdInfo.servingSize;
  const multiplier = (quantity / servingQuantity);
  
  return {
    multiplier,
    convertedQuantity: atlasSearchResult.baseServingSize * multiplier,
    convertedUnit: atlasSearchResult.baseServingUnit || "g",
    matchedFood: null,
    householdServing: `${quantity} ${parsedInput.quantity}`,
    servingQuantity: servingQuantity,
  };
}

// ============================================================================
// MAIN DATABASE SEARCH FUNCTION
// ============================================================================

async function searchDatabase(cleanSearchTerm, parsedInput) {
  console.log("=== DATABASE SEARCH START ===");
  console.log("Searching for:", cleanSearchTerm);
  console.log("Parsed input:", parsedInput);
  
  // Generate search terms
  const searchTerms = generateSearchTerms(cleanSearchTerm, parsedInput);
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

