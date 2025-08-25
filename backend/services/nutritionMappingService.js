// ============================================================================
// NUTRITION MAPPING SERVICE
// ============================================================================
// This service standardizes nutrition data from different API sources
// and maps them to a common format for storage and retrieval
// All nutrition values are normalized to per 1g/1ml basis

// ============================================================================
// NUTRITION FIELD MAPPINGS
// ============================================================================

// Common nutrition fields that we want to extract and standardize
const NUTRITION_FIELDS = {
  // Basic nutrition info
  calories: { usda: 'Energy', edamam: 'ENERC_KCAL', unit: 'KCAL' },
  protein: { usda: 'Protein', edamam: 'PROCNT', unit: 'G' },
  fat: { usda: 'Total lipid (fat)', edamam: 'FAT', unit: 'G' },
  carbohydrates: { usda: 'Carbohydrate, by difference', edamam: 'CHOCDF', unit: 'G' },
  fiber: { usda: 'Fiber, total dietary', edamam: 'FIBTG', unit: 'G' },
  sugar: { usda: 'Total Sugars', edamam: 'SUGAR', unit: 'G' },
  sodium: { usda: 'Sodium, Na', edamam: 'NA', unit: 'MG' },
  cholesterol: { usda: 'Cholesterol', edamam: 'CHOLE', unit: 'MG' },
  potassium: { usda: 'Potassium, K', edamam: 'K', unit: 'MG' },
  calcium: { usda: 'Calcium, Ca', edamam: 'CA', unit: 'MG' },
  iron: { usda: 'Iron, Fe', edamam: 'FE', unit: 'MG' },
  vitaminA: { usda: 'Vitamin A, IU', edamam: 'VITA_RAE', unit: 'UG' },
  vitaminC: { usda: 'Vitamin C, total ascorbic acid', edamam: 'VITC', unit: 'MG' },
  vitaminD: { usda: 'Vitamin D (D2 + D3), International Units', edamam: 'VITD', unit: 'UG' },
  vitaminE: { usda: 'Vitamin E (alpha-tocopherol)', edamam: 'TOCPHA', unit: 'MG' },
  vitaminB12: { usda: 'Vitamin B-12', edamam: 'VITB12', unit: 'UG' },
  folate: { usda: 'Folate, total', edamam: 'FOLAC', unit: 'UG' },
  magnesium: { usda: 'Magnesium, Mg', edamam: 'MG', unit: 'MG' },
  phosphorus: { usda: 'Phosphorus, P', edamam: 'P', unit: 'MG' },
  zinc: { usda: 'Zinc, Zn', edamam: 'ZN', unit: 'MG' },
  copper: { usda: 'Copper, Cu', edamam: 'CU', unit: 'MG' },
  manganese: { usda: 'Manganese, Mn', edamam: 'MN', unit: 'MG' },
  selenium: { usda: 'Selenium, Se', edamam: 'SE', unit: 'UG' }
};

// ============================================================================
// USDA API MAPPING FUNCTIONS
// ============================================================================

function extractUSDANutrition(usdaData) {
  const nutrition = {
    calories: 0,
    protein: 0,
    fat: 0,
    carbohydrates: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0,
    cholesterol: 0,
    potassium: 0,
    calcium: 0,
    iron: 0,
    vitaminA: 0,
    vitaminC: 0,
    vitaminD: 0,
    vitaminE: 0,
    vitaminB12: 0,
    folate: 0,
    magnesium: 0,
    phosphorus: 0,
    zinc: 0,
    copper: 0,
    manganese: 0,
    selenium: 0
  };

  // Get the serving size for normalization
  const servingSize = usdaData.servingSize || 1;

  // Extract nutrition values from foodNutrients array
  if (usdaData.foodNutrients && Array.isArray(usdaData.foodNutrients)) {
    usdaData.foodNutrients.forEach(nutrient => {
      const nutrientName = nutrient.nutrientName;
      console.log(nutrientName + " : " + nutrient.value);
      const value = nutrient.value || 0;
      // Map each nutrient to our standardized fields
      Object.keys(NUTRITION_FIELDS).forEach(field => {
        const mapping = NUTRITION_FIELDS[field];
        if (mapping.usda === nutrientName) {
          // Normalize to per 1g/1ml basis
          nutrition[field] = value / servingSize;
        }
      });
    });
  }

  // Round the nutrition values to 2 decimal places
  return roundNutritionData(nutrition);
}

// ============================================================================
// EDAMAM API MAPPING FUNCTIONS
// ============================================================================

function extractEdamamNutrition(edamamData) {
  const nutrition = {
    calories: 0,
    protein: 0,
    fat: 0,
    carbohydrates: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0,
    cholesterol: 0,
    potassium: 0,
    calcium: 0,
    iron: 0,
    vitaminA: 0,
    vitaminC: 0,
    vitaminD: 0,
    vitaminE: 0,
    vitaminB12: 0,
    folate: 0,
    magnesium: 0,
    phosphorus: 0,
    zinc: 0,
    copper: 0,
    manganese: 0,
    selenium: 0
  };

  // Get the total weight for normalization
  const totalWeight = edamamData.totalWeight || 1;

  // Extract calories
  nutrition.calories = (edamamData.calories || 0) / totalWeight;

  // Extract nutrition values from totalNutrients
  if (edamamData.totalNutrients) {
    Object.keys(edamamData.totalNutrients).forEach(nutrientKey => {
      const nutrient = edamamData.totalNutrients[nutrientKey];
      const value = nutrient.quantity || 0;

      // Map each nutrient to our standardized fields
      Object.keys(NUTRITION_FIELDS).forEach(field => {
        const mapping = NUTRITION_FIELDS[field];
        if (mapping.edamam === nutrientKey) {
          // Normalize to per 1g/1ml basis
          nutrition[field] = value / totalWeight;
        }
      });
    });
  }

  // Round the nutrition values to 2 decimal places
  return roundNutritionData(nutrition);
}

// ============================================================================
// MAIN MAPPING FUNCTION
// ============================================================================

function mapNutritionData(apiData, source) {
  console.log(`Mapping nutrition data from ${source} API`);
  
  try {
    let nutrition;
    
    switch (source) {
      case 'usda':
        nutrition = extractUSDANutrition(apiData);
        break;
      case 'edamam':
        nutrition = extractEdamamNutrition(apiData);
        break;
      default:
        console.warn(`Unknown API source: ${source}, returning empty nutrition object`);
        return {
          calories: 0,
          protein: 0,
          fat: 0,
          carbohydrates: 0,
          fiber: 0,
          sugar: 0,
          sodium: 0,
          cholesterol: 0,
          potassium: 0,
          calcium: 0,
          iron: 0,
          vitaminA: 0,
          vitaminC: 0,
          vitaminD: 0,
          vitaminE: 0,
          vitaminB12: 0,
          folate: 0,
          magnesium: 0,
          phosphorus: 0,
          zinc: 0,
          copper: 0,
          manganese: 0,
          selenium: 0
        };
    }

    // Round the nutrition values to 2 decimal places
    const roundedNutrition = roundNutritionData(nutrition);
    
    console.log(`Successfully mapped ${source} nutrition data (normalized to per 1g/1ml)`);
    return roundedNutrition;
    
  } catch (error) {
    console.error(`Error mapping ${source} nutrition data:`, error);
    // Return empty nutrition object as fallback
    return {
      calories: 0,
      protein: 0,
      fat: 0,
      carbohydrates: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
      cholesterol: 0,
      potassium: 0,
      calcium: 0,
      iron: 0,
      vitaminA: 0,
      vitaminC: 0,
      vitaminD: 0,
      vitaminE: 0,
      vitaminB12: 0,
      folate: 0,
      magnesium: 0,
      phosphorus: 0,
      zinc: 0,
      copper: 0,
      manganese: 0,
      selenium: 0
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getNutritionValue(nutrition, field) {
  return nutrition[field] || 0;
}

function hasNutritionData(nutrition) {
  return nutrition && (
    nutrition.calories > 0 || 
    nutrition.protein > 0 || 
    nutrition.fat > 0 || 
    nutrition.carbohydrates > 0
  );
}

// Round nutrition values to 2 decimal places
function roundNutritionData(nutrition) {
  const roundedNutrition = {};
  
  Object.keys(nutrition).forEach(field => {
    if (typeof nutrition[field] === 'number') {
      roundedNutrition[field] = Math.round(nutrition[field] * 100) / 100;
    } else {
      roundedNutrition[field] = nutrition[field];
    }
  });
  
  return roundedNutrition;
}

// Get unit for a specific nutrition field
function getNutritionUnit(field) {
  return NUTRITION_FIELDS[field]?.unit || 'G';
}

// Get all nutrition units
function getNutritionUnits() {
  const units = {};
  Object.keys(NUTRITION_FIELDS).forEach(field => {
    units[field] = NUTRITION_FIELDS[field].unit;
  });
  return units;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  mapNutritionData,
  extractUSDANutrition,
  extractEdamamNutrition,
  getNutritionValue,
  hasNutritionData,
  roundNutritionData,
  getNutritionUnit,
  getNutritionUnits,
  NUTRITION_FIELDS
};
