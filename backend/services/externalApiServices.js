const axios = require("axios");

// Separate USDA API call
const getUSDANutritionData = async (foodName, unit) => {
  console.log("Calling USDA API for:", foodName);
  console.log("Unit:", unit);
  
  try {
    const USDA_url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${process.env.USDA_API_KEY}&dataType=Branded,Survey%20FNDDS&query=${foodName}`;
    const USDA_response = await axios.get(USDA_url);
    
    // console.log("USDA API response:", JSON.stringify(USDA_response.data, null, 2));
    
    if (
      USDA_response &&
      USDA_response.data.foods &&
      USDA_response.data.foods.length > 0 &&
      USDA_response.data.foods[0].foodNutrients.find(
        (nutrient) => nutrient.nutrientName === "Energy"
      ) !== undefined
    ) {
      // Return all foods and let the controller handle the matching
      // This allows convertToBaseUnit to find the best match
      const USDA_data = USDA_response.data.foods[0]; // Default fallback
      return {
        response: USDA_data,
        edamam: false,
        unit: unit,
        foods: USDA_response.data.foods,
        success: true
      };
    } else {
      console.log("USDA API: No valid nutrition data found");
      return {
        success: false,
        message: "No valid nutrition data found in USDA API"
      };
    }
  } catch (error) {
    console.error("USDA API Error:", error.message);
    return {
      success: false,
      error: error.message,
      message: "USDA API call failed"
    };
  }
};

// Separate Edamam API call
const getEdamamNutritionData = async (foodName) => {
  console.log("Calling Edamam API for:", foodName);
  
  try {
    const edamam_url = `https://api.edamam.com/api/nutrition-data?app_id=${process.env.EDAMAM_APP_ID}&app_key=${process.env.EDAMAM_APP_KEY}&nutrition-type=logging&ingr=${foodName}`;
    const edamam_response = await axios.get(edamam_url);
    
    //console.log("Edamam API response:", JSON.stringify(edamam_response.data, null, 2));

    if (edamam_response.status !== false) {
      return { 
        response: edamam_response.data, 
        edamam: true,
        success: true
      };
    } else {
      console.log("Edamam API: No valid nutrition data found");
      return {
        success: false,
        message: "No valid nutrition data found in Edamam API"
      };
    }
  } catch (error) {
    console.error("Edamam API Error:", error.message);
    return {
      success: false,
      error: error.message,
      message: "Edamam API call failed"
    };
  }
};

// Main function that maintains existing functionality
const getNutritionData = async (foodName, unit) => {
  console.log("foodName:", foodName);
  console.log("unit:", unit);
  
  // Try Edamam API first
  const edamamResult = await getEdamamNutritionData(foodName);
  
  if (edamamResult.success) {
    console.log("Edamam API successful, returning data");
    return edamamResult;
  }
  
  // If Edamam fails, try USDA API
  console.log("Edamam API failed, trying USDA API");
  const usdaResult = await getUSDANutritionData(foodName, unit);
  
  if (usdaResult.success) {
    console.log("USDA API successful, returning data");
    return usdaResult;
  }
  
  // If both APIs fail, throw error
  throw new Error(
    "No nutrition data found from either Edamam or USDA APIs"
  );
};

module.exports = {
  getNutritionData,
  getUSDANutritionData,
  getEdamamNutritionData,
};
