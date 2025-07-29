const axios = require("axios");

const getNutritionData = async (foodName) => {
  // First try USDA API
  const USDA_url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${process.env.USDA_API_KEY}&dataType=Branded,Survey%20FNDDS&query=${foodName}`;
  const USDA_response = await axios.get(USDA_url);
  // console.log("USDA API response:", JSON.stringify(USDA_response.data, null, 2));
  //USDA_response.data.foods && USDA_response.data.foods.length > 0
  // Check if USDA returned valid data
  if (USDA_response) {
    //console.log("USDA data found, using USDA as source.");
    const USDA_data = USDA_response.data.foods[0];
    return { response: USDA_data, edamam: false };
  } else {
    //console.log("No USDA data found, falling back to Edamam.");
    // If USDA didn't return results, try Edamam API
    const edamam_url = `https://api.edamam.com/api/nutrition-data?app_id=${process.env.EDAMAM_APP_ID}&app_key=${process.env.EDAMAM_APP_KEY}&nutrition-type=logging&ingr=${foodName}`;
    const edamam_response = await axios.get(edamam_url);
    //console.log("Edamam API response:", JSON.stringify(edamam_response.data, null, 2));

    if (edamam_response.data.calories !== 0) {
      //console.log("Edamam data found, using Edamam as source.");
      return { response: edamam_response.data, edamam: true };
    } else {
      //console.log("No nutrition data found from either USDA or Edamam APIs");
      throw new Error(
        "No nutrition data found from either USDA or Edamam APIs"
      );
    }
  }
};

module.exports = {
  getNutritionData,
};
