const Nutrition = require("./Nutrition");
const { unknownUnits } = require("../utils/helpers");

// Search Functions
function generateSearchTerms(cleanSearchTerm, parsedInput) {
  let searchTerms = [cleanSearchTerm];
  
  if (parsedInput?.quantity && unknownUnits.includes(parsedInput.quantity)) {
    const oldPatternSearchTerm = `${cleanSearchTerm}_${parsedInput.quantity}`;
    searchTerms.push(oldPatternSearchTerm);
    
    // Also try with the full household serving text pattern
    const oldPatternWithServing = `${cleanSearchTerm}_2_${parsedInput.quantity.toUpperCase()}S`;
    searchTerms.push(oldPatternWithServing);
  }
  
  return searchTerms;
}

async function performAtlasSearch(searchTerms) {
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
  
  return uniqueResults;
}

function filterAtlasSearchResults(atlasSearchResults, cleanSearchTerm, parsedInput) {
  if (atlasSearchResults.length === 0) return atlasSearchResults;

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
      return filteredResults;
    }
  }
  
  return atlasSearchResults;
}

module.exports = {
  generateSearchTerms,
  performAtlasSearch,
  filterAtlasSearchResults,
};
