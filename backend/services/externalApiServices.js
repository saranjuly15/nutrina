const axios = require("axios");

const getNutritionData = async (foodName, unit) => {
  console.log("foodName:", foodName);
  console.log("unit:", unit);
  // USDA API
  const USDA_url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${process.env.USDA_API_KEY}&dataType=Branded,Survey%20FNDDS&query=${foodName}`;
  const USDA_response = await axios.get(USDA_url);
  // console.log("USDA API response:", JSON.stringify(USDA_response.data, null, 2));
  if (
    USDA_response &&
    USDA_response.data.foods[0].foodNutrients.find(
      (nutrient) => nutrient.nutrientName === "Energy"
    ) !== undefined
  ) {
    // Return all foods and let the controller handle the matching
    // This allows convertToBaseUnit to find the best match
    const USDA_data = USDA_response.data.foods[0]; // Default fallback
    return { response: USDA_data, edamam: false, unit: unit, foods: USDA_response.data.foods };
  } else {
    // Edamam API
    const edamam_url = `https://api.edamam.com/api/nutrition-data?app_id=${process.env.EDAMAM_APP_ID}&app_key=${process.env.EDAMAM_APP_KEY}&nutrition-type=logging&ingr=${foodName}`;
    const edamam_response = await axios.get(edamam_url);
    //console.log("Edamam API response:", JSON.stringify(edamam_response.data, null, 2));

    if (edamam_response.data.calories !== 0) {
      return { response: edamam_response.data, edamam: true };
    } else {
      throw new Error(
        "No nutrition data found from either USDA or Edamam APIs"
      );
    }
  }
};

module.exports = {
  getNutritionData,
};
