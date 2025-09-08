const { searchDatabase, createHouseholdServingConversion } = require("./databaseSearchService");
const { searchUSDA } = require("./usdaSearchService");
const { searchEdamam } = require("./edamamSearchService");
const { SOURCE_URLS } = require("./externalApiServices");

// ============================================================================
// MAIN SEARCH ORCHESTRATOR
// ============================================================================

async function performCompleteSearch(quantity, parsedInput, searchFoodName, foodName) {
  console.log("=== COMPLETE SEARCH ORCHESTRATION START ===");
  console.log("Search parameters:", {
    quantity,
    parsedInput,
    searchFoodName,
    foodName
  });
  
  // Step 1: Search Database
  const databaseResult = await searchDatabase(searchFoodName, parsedInput);
  
  if (databaseResult.success) {
    console.log("Database search successful, returning result");
    return {
      ...databaseResult,
      searchMethod: "database"
    };
  }
  
  // Step 2: Search APIs in the order defined by SOURCE_URLS (if database search failed)
  console.log("Database search failed, trying APIs in order:", SOURCE_URLS.map(s => s.Name));
  
  for (const source of SOURCE_URLS) {
    console.log(`Trying ${source.Name} API`);
    
    let apiResult;
    if (source.Name === "Edamam") {
      apiResult = await searchEdamam(quantity, parsedInput, searchFoodName, foodName);
    } else if (source.Name === "USDA") {
      apiResult = await searchUSDA(quantity, parsedInput, searchFoodName, foodName);
    } else {
      console.log(`Unknown API source: ${source.Name}, skipping`);
      continue;
    }
    
    if (apiResult.success) {
      console.log(`${source.Name} API search successful, returning result`);
      return {
        ...apiResult,
        searchMethod: source.Name.toLowerCase()
      };
    } else {
      console.log(`${source.Name} API search failed, trying next API`);
    }
  }
  
  // Step 4: All searches failed
  console.log("=== ALL SEARCHES FAILED ===");
  return {
    success: false,
    source: "none",
    message: "No nutrition data found from database, Edamam, or USDA APIs",
    error: "All search methods failed"
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Main search function
  performCompleteSearch,
  
  // Helper functions (re-exported from other services)
  createHouseholdServingConversion
};
