const { searchDatabase, createHouseholdServingConversion } = require("./databaseSearchService");
const { searchUSDA } = require("./usdaSearchService");
const { searchEdamam } = require("./edamamSearchService");

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
  
  // Step 2: Search USDA API (if database search failed)
  console.log("Database search failed, trying USDA API");
  const usdaResult = await searchUSDA(quantity, parsedInput, searchFoodName, foodName);
  
  if (usdaResult.success) {
    console.log("USDA API search successful, returning result");
    return {
      ...usdaResult,
      searchMethod: "usda"
    };
  }
  
  // Step 3: Search Edamam API (if USDA search failed)
  console.log("USDA API search failed, trying Edamam API");
  const edamamResult = await searchEdamam(quantity, parsedInput, searchFoodName, foodName);
  
  if (edamamResult.success) {
    console.log("Edamam API search successful, returning result");
    return {
      ...edamamResult,
      searchMethod: "edamam"
    };
  }
  
  // Step 4: All searches failed
  console.log("=== ALL SEARCHES FAILED ===");
  return {
    success: false,
    source: "none",
    message: "No nutrition data found from database, USDA, or Edamam APIs",
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
