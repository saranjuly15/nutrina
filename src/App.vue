<template>
  <div id="app">
    <h1>Nutrina - Nutrition Tracker</h1>

    <!-- Navigation Links -->
    <div class="nav-links">
      <button
        class="nav-btn"
        :class="{ active: currentView === 'single' }"
        @click="currentView = 'single'"
      >
        Single Food Search
      </button>
      <button
        class="nav-btn"
        :class="{ active: currentView === 'bulk' }"
        @click="currentView = 'bulk'"
      >
        Bulk Food Search
      </button>
    </div>

    <!-- Single Food Search Section -->
    <div v-if="currentView === 'single'" class="single-food-section">
      <div class="search-container">
        <input
          type="text"
          v-model="searchQuery"
          placeholder="Search for food (e.g., banana, apple, chicken)"
          @keyup.enter="searchFood"
        />
        <button @click="searchFood" :disabled="loading">
          {{ loading ? "Searching..." : "Search" }}
        </button>
      </div>

      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>Searching for nutritional information...</p>
      </div>

      <div v-else-if="error" class="error">
        <h3>Error</h3>
        <p>{{ error }}</p>
      </div>

      <div v-else-if="foodData" class="food-details">
        <div v-if="searchQuery !== null">
          <h2>🍽️ {{ foodItems }}</h2>

          <!-- Show base nutrition info if available -->
          <div
            v-if="
              foodData.conversion &&
              foodData.conversion.baseServingSize &&
              foodData.parsedInput &&
              foodData.parsedInput.number > 1
            "
            class="base-nutrition"
          >
            <p class="base-info">
              <small>
                <strong>Base nutrition:</strong>
                {{
                  Math.round(
                    (foodData.calories / foodData.conversion.multiplier) * 100
                  ) / 100
                }}
                calories per {{ foodData.conversion.baseServingSize
                }}{{ foodData.conversion.convertedUnit }}
              </small>
            </p>
          </div>

          <p class="calories" v-if="foodData">
            {{ foodData.calories }} calories
          </p>
          <p class="weight" v-if="foodData && foodData.conversion">
            {{
              foodData.conversion.multiplier *
              foodData.conversion.baseServingSize
            }}{{ foodData.conversion.convertedUnit }}
          </p>

          <!-- Source and serving info -->
          <div class="source-info" v-if="foodData">
            <p class="source">
              <strong>Source:</strong> {{ foodData.source.toUpperCase() }}
              <span v-if="foodData.parsedInput">
                | <strong>Quantity:</strong> {{ foodData.parsedInput.number }}
                {{ foodData.parsedInput.food }}
              </span>
            </p>
          </div>
        </div>

        <div class="nutrition-grid">
          <div class="nutrition-section">
            <h3>Macronutrients</h3>
            <div class="nutrient-item">
              <span>Protein:</span>
              <span>{{ foodData.protein }}g</span>
            </div>
            <div class="nutrient-item">
              <span>Fat:</span>
              <span>{{ foodData.fat }}g</span>
            </div>
            <div class="nutrient-item">
              <span>Carbohydrates:</span>
              <span>{{ foodData.carbohydrates }}g</span>
            </div>
            <div class="nutrient-item">
              <span>Fiber:</span>
              <span>{{ foodData.fiber }}g</span>
            </div>
            <div class="nutrient-item">
              <span>Sugar:</span>
              <span>{{ foodData.sugar }}g</span>
            </div>
          </div>

          <div class="nutrition-section">
            <h3>Micronutrients</h3>
            <div class="nutrient-item">
              <span>Sodium:</span>
              <span>{{ foodData.sodium }}mg</span>
            </div>
            <div class="nutrient-item">
              <span>Potassium:</span>
              <span>{{ foodData.potassium }}mg</span>
            </div>
            <div class="nutrient-item">
              <span>Calcium:</span>
              <span>{{ foodData.calcium }}mg</span>
            </div>
            <div class="nutrient-item">
              <span>Iron:</span>
              <span>{{ foodData.iron }}mg</span>
            </div>
            <div class="nutrient-item">
              <span>Cholesterol:</span>
              <span>{{ foodData.cholesterol }}mg</span>
            </div>
            <div class="nutrient-item">
              <span>Magnesium:</span>
              <span>{{ foodData.magnesium }}mg</span>
            </div>
            <div class="nutrient-item">
              <span>Phosphorus:</span>
              <span>{{ foodData.phosphorus }}mg</span>
            </div>
            <div class="nutrient-item">
              <span>Zinc:</span>
              <span>{{ foodData.zinc }}mg</span>
            </div>
          </div>

          <div class="nutrition-section">
            <h3>Vitamins</h3>
            <div class="nutrient-item">
              <span>Vitamin A:</span>
              <span>{{ foodData.vitaminA }}mcg</span>
            </div>
            <div class="nutrient-item">
              <span>Vitamin C:</span>
              <span>{{ foodData.vitaminC }}mg</span>
            </div>
            <div class="nutrient-item">
              <span>Vitamin D:</span>
              <span>{{ foodData.vitaminD }}mcg</span>
            </div>
            <div class="nutrient-item">
              <span>Vitamin E:</span>
              <span>{{ foodData.vitaminE }}mg</span>
            </div>
            <div class="nutrient-item">
              <span>Vitamin B12:</span>
              <span>{{ foodData.vitaminB12 }}mcg</span>
            </div>
            <div class="nutrient-item">
              <span>Folate:</span>
              <span>{{ foodData.folate }}mcg</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- <div class="message">
       <p></p>
     </div> -->
    <div
      v-if="allNutrition.length > 0 && currentView === 'single'"
      class="all-nutrition"
    >
      <h2>All Foods in the Database</h2>
      <div class="nutrition-table-wrapper">
        <table class="nutrition-table">
          <thead>
            <tr>
              <th>Food Name</th>
              <th>Calories</th>
              <th>Serving Size</th>
              <th>Household Serving</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="nutrition in allNutrition" :key="nutrition._id">
              <td>{{ nutrition.name }}</td>
              <td>
                {{
                  nutrition.nutrients.calories
                    ? Math.round(nutrition.nutrients.calories * 100) / 100
                    : Math.round(
                        getEnergyValue(nutrition.nutrients.foodNutrients) * 100
                      ) / 100
                }}
              </td>
              <td>
                {{ Math.round(nutrition.baseServingSize * 100) / 100 }}
              </td>
              <td>
                <div
                  v-if="nutrition.householdServings.length > 0"
                  class="household-servings-container"
                >
                  <div
                    v-for="serving in nutrition.householdServings"
                    :key="serving.servingSize"
                    class="household-serving-item"
                  >
                    <span class="serving-amount">{{
                      serving.servingSize
                    }}</span>
                    <span class="serving-unit">{{
                      nutrition.baseServingUnit
                    }}</span>
                    <span class="serving-separator">=</span>
                    <span class="household-unit">{{
                      serving.servingUnit
                    }}</span>
                  </div>
                </div>
                <span v-else class="no-household-serving">
                  <span class="no-serving-icon">—</span>
                  <span class="no-serving-text">No household units</span>
                </span>
              </td>
              <td>{{ nutrition.fromUSDA ? "USDA" : "Edamam" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <!-- <div v-else class="no-nutrition-msg">
        <p>No foods found in the database.</p>
      </div> -->
    </div>

    <!-- Bulk Food API Test Section -->
    <div v-else-if="currentView === 'bulk'" class="bulk-test-section">
      <div class="bulk-header">
        <h2>Bulk Food Search</h2>
      </div>

      <!-- Food Items Form -->
      <div class="food-items-section">
        <div
          v-for="(item, index) in bulkFoodItems"
          :key="index"
          class="food-item"
        >
          <div class="food-item-header">
            <span class="food-item-title">Food Item {{ index + 1 }}</span>
            <button class="remove-btn" @click="removeFoodItem(index)">
              Remove
            </button>
          </div>
          <div class="food-item-fields">
            <div class="form-group">
              <label>Name:</label>
              <input
                type="text"
                v-model="item.name"
                placeholder="e.g., chicken pizza"
                required
              />
            </div>
            <div class="form-group">
              <label>Quantity:</label>
              <input
                type="number"
                v-model="item.quantity"
                placeholder="1"
                min="0.1"
                step="0.1"
                required
              />
            </div>
            <div class="form-group">
              <label>Unit (optional):</label>
              <input
                type="text"
                v-model="item.unit"
                placeholder="e.g., slice, cup, ml"
              />
            </div>
          </div>
        </div>

        <div class="button-group">
          <button class="add-food-btn" @click="addFoodItem">
            ➕ Add Food Item
          </button>
          <button class="test-btn" @click="testBulkAPI" :disabled="bulkLoading">
            {{ bulkLoading ? "Submitting..." : " Submit" }}
          </button>
        </div>
      </div>

      <!-- Response Section -->
      <div class="response-section">
        <div class="response-header">
          <h3>Response:</h3>
          <button class="clear-btn" @click="clearBulkResponse">Clear</button>
        </div>
        <div class="response-content" v-if="bulkResponse">
          <pre>{{ JSON.stringify(bulkResponse, null, 2) }}</pre>
          <div v-if="bulkResponse.status === 'success'" class="success-message">
            Success!
          </div>
          <div v-else class="error-message">Error!</div>
        </div>
        <div v-else class="no-response">No response yet...</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from "vue";

const currentView = ref("single");
const searchQuery = ref("");
const foodData = ref(null);
const loading = ref(false);
const error = ref(null);
const foodItems = ref(null);
const allNutrition = ref([]);

// Bulk API variables
const bulkLoading = ref(false);
const bulkResponse = ref(null);
const bulkFoodItems = ref([]);

const getEnergyValue = (foodNutrients, data) => {
  // 1. Edamam: calories at top level
  if (data && typeof data.calories === "number" && data.calories > 0) {
    return data.calories;
  }
  // 2. Edamam: calories in totalNutrients
  if (
    data &&
    data.totalNutrients &&
    data.totalNutrients.ENERC_KCAL &&
    typeof data.totalNutrients.ENERC_KCAL.quantity === "number"
  ) {
    return Math.round(data.totalNutrients.ENERC_KCAL.quantity);
  }
  // 3. USDA: calories in foodNutrients array
  if (foodNutrients && Array.isArray(foodNutrients)) {
    const energyNutrient = foodNutrients.find(
      (nutrient) => nutrient.nutrientName === "Energy"
    );
    return energyNutrient ? energyNutrient.value : 0;
  }
  return 0;
};

const searchFood = async () => {
  foodItems.value = searchQuery.value;
  if (!searchQuery.value.trim()) {
    error.value = "Please enter a food name";
    return;
  }

  loading.value = true;
  error.value = null;
  foodData.value = null;

  try {
    const response = await fetch(
      `http://localhost:5000/api/nutrition?foodName=${encodeURIComponent(
        searchQuery.value
      )}`
    );
    const data = await response.json();

    if (response.status === 200) {
      foodData.value = data;
      console.log("Food data:", foodData.value);
      await getAllNutrition(); // Refresh the table after successful search/add
    } else {
      error.value = data?.message || "Food not found";
    }
  } catch (err) {
    error.value =
      "Failed to connect to server. Make sure your backend is running on port 5000.";
    console.error("Error:", err);
  } finally {
    loading.value = false;
  }
};

const getAllNutrition = async () => {
  const response = await fetch("http://localhost:5000/api/nutrition/all");
  const data = await response.json();
  allNutrition.value = data.data;
};

// Bulk API functions
const addFoodItem = () => {
  console.log("Adding food item, current count:", bulkFoodItems.value.length);
  bulkFoodItems.value.push({
    name: "",
    quantity: "1",
    unit: "",
  });
  console.log("After adding, count:", bulkFoodItems.value.length);
};

const removeFoodItem = (index) => {
  bulkFoodItems.value.splice(index, 1);
};

const getFoodItems = () => {
  return bulkFoodItems.value.filter((item) => item.name && item.quantity);
};

const testBulkAPI = async () => {
  const foodItems = getFoodItems();

  if (foodItems.length === 0) {
    bulkResponse.value = { error: "Please add at least one food item." };
    return;
  }

  bulkLoading.value = true;

  try {
    const apiResponse = await fetch(
      "http://localhost:5000/api/nutrition/bulk",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ foodItems: foodItems }),
      }
    );

    const data = await apiResponse.json();
    bulkResponse.value = data;
  } catch (error) {
    bulkResponse.value = { error: `Error: ${error.message}` };
  } finally {
    bulkLoading.value = false;
  }
};

const clearBulkResponse = () => {
  bulkResponse.value = null;
};

// Initialize bulk test when switching to it
watch(currentView, (newValue) => {
  console.log("Current view changed to:", newValue);
  if (newValue === "bulk") {
    console.log(
      "Bulk view selected, current items:",
      bulkFoodItems.value.length
    );
    if (bulkFoodItems.value.length === 0) {
      console.log("Adding initial food item");
      addFoodItem();
    }
  }
});

onMounted(() => {
  getAllNutrition();
});

watch(searchQuery, () => {
  getAllNutrition();
});
</script>

<style>
#app {
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin: 0;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}

body {
  display: block;
  margin: 0;
  padding: 0;
}

h1 {
  color: white;
  margin-bottom: 30px;
  font-size: 2.5rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.search-container {
  margin-bottom: 30px;
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

input {
  padding: 12px 20px;
  font-size: 16px;
  border: none;
  border-radius: 25px;
  width: 300px;
  max-width: 100%;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

button {
  padding: 12px 30px;
  font-size: 16px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  transition: background 0.3s;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

button:hover:not(:disabled) {
  background: #45a049;
}

button:disabled {
  background: #cccccc;
  cursor: not-allowed;
}

.loading {
  color: white;
  margin: 40px 0;
}

.spinner {
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid white;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.error {
  background: #ff6b6b;
  color: white;
  padding: 20px;
  border-radius: 10px;
  margin: 20px auto;
  max-width: 500px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.food-details {
  background: white;
  border-radius: 15px;
  padding: 30px;
  margin: 20px auto;
  max-width: 800px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.source {
  color: #7f8c8d;
  font-style: italic;
  margin: 5px 0;
}

.calories {
  font-size: 1.5rem;
  color: #e74c3c;
  font-weight: bold;
  margin: 10px 0;
}

.weight {
  font-size: 1.5rem;
  color: #e74c3c;
  font-weight: bold;
  margin: 10px 0;
}
.nutrition-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 30px;
  margin: 30px 0;
}

.nutrition-section {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 10px;
  border-left: 4px solid #3498db;
}

.nutrition-section h3 {
  color: #2c3e50;
  margin: 0 0 20px 0;
  font-size: 1.3rem;
}

.nutrient-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #e9ecef;
}

.nutrient-item:last-child {
  border-bottom: none;
}

.nutrient-item span:first-child {
  font-weight: 500;
  color: #495057;
}

.nutrient-item span:last-child {
  font-weight: bold;
  color: #2c3e50;
}

.message {
  background: #d4edda;
  color: #155724;
  padding: 15px;
  border-radius: 8px;
  margin-top: 20px;
  border-left: 4px solid #28a745;
}

.nutrition-table-wrapper {
  max-height: 320px;
  overflow-y: auto;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  background: #fff;
  max-width: 500px;
  margin: 0 auto;
}

.nutrition-table {
  width: 100%;
  max-width: 500px;
  margin: 0 auto;
  border-collapse: separate;
  border-spacing: 0;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  font-size: 0.97rem;
}

.nutrition-table th,
.nutrition-table td {
  padding: 0.45rem 0.7rem;
  text-align: left;
}

.nutrition-table th {
  background: #f5f5f5;
  font-weight: 600;
  border-bottom: 1.5px solid #e0e0e0;
}

.nutrition-table tr:nth-child(even) {
  background: #fafafa;
}

.nutrition-table tr:hover {
  background: #f0f7ff;
  transition: background 0.2s;
}

.nutrition-table td,
.nutrition-table th {
  border-right: 1px solid #f0f0f0;
}

.nutrition-table tr td:last-child,
.nutrition-table tr th:last-child {
  border-right: none;
}

.household-servings-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.household-serving-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #bbdefb;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
}

.household-serving-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  background: linear-gradient(135deg, #e8f4fd 0%, #f8e8fb 100%);
}

.serving-icon {
  font-size: 1rem;
  opacity: 0.8;
}

.serving-amount {
  font-weight: 700;
  color: #1976d2;
  font-size: 0.95rem;
}

.serving-unit {
  color: #666;
  font-size: 0.85rem;
  font-weight: 500;
}

.serving-separator {
  color: #999;
  font-weight: 600;
  font-size: 0.9rem;
}

.household-unit {
  background: #1976d2;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 1px 3px rgba(25, 118, 210, 0.3);
}

.no-household-serving {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #999;
  font-style: italic;
  font-size: 0.9rem;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px dashed #ddd;
}

.no-serving-icon {
  font-size: 1.2rem;
  opacity: 0.6;
}

.no-serving-text {
  font-size: 0.85rem;
}

.no-nutrition-msg {
  text-align: center;
  padding: 20px;
  color: #555;
  font-style: italic;
}

@media (max-width: 768px) {
  .search-container {
    flex-direction: column;
    align-items: center;
  }

  input {
    width: 100%;
    max-width: 300px;
  }

  .nutrition-grid {
    grid-template-columns: 1fr;
  }

  .nav-links {
    flex-direction: column;
    align-items: center;
  }

  .food-item-fields {
    grid-template-columns: 1fr;
  }

  .button-group {
    flex-direction: column;
  }

  .bulk-test-section,
  .structured-test-section {
    padding: 20px;
  }
}

/* Navigation Links */
.nav-links {
  display: flex;
  justify-content: center;
  gap: 15px;
  margin-bottom: 30px;
  flex-wrap: wrap;
}

.nav-btn {
  padding: 12px 24px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border-radius: 25px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.nav-btn.active {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

/* Bulk Test Section Styles */
.bulk-test-section,
.structured-test-section {
  max-width: 800px;
  margin: 0 auto;
  background: white;
  border-radius: 15px;
  padding: 30px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.bulk-header,
.structured-header {
  text-align: center;
  margin-bottom: 30px;
}

.bulk-header h2,
.structured-header h2 {
  color: #2c3e50;
  font-size: 2rem;
  margin-bottom: 10px;
}

.bulk-header p,
.structured-header p {
  color: #666;
  font-size: 1.1rem;
}

.instructions {
  background: #e3f2fd;
  border: 1px solid #bbdefb;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
}

.instructions h3 {
  color: #1976d2;
  margin-bottom: 15px;
}

.instructions ul {
  list-style: none;
  padding-left: 0;
}

.instructions li {
  margin-bottom: 8px;
  color: #424242;
  padding-left: 20px;
  position: relative;
}

.instructions li:before {
  content: "•";
  color: #1976d2;
  position: absolute;
  left: 0;
}

.food-items-section {
  margin-bottom: 30px;
}

.food-item {
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 15px;
  background: #f8f9fa;
}

.food-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.food-item-title {
  font-weight: 600;
  color: #333;
  font-size: 1.1rem;
}

.remove-btn {
  background: #dc3545;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.3s;
}

.remove-btn:hover {
  background: #c82333;
}

.food-item-fields {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 15px;
}

.form-group {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #333;
  font-size: 0.9rem;
}

.form-group input {
  width: 100%;
  padding: 10px;
  border: 2px solid #e1e5e9;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.3s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
}

.button-group,
.test-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 20px;
}

.add-food-btn,
.load-sample-btn,
.test-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s;
}

.add-food-btn {
  background: #28a745;
  color: white;
}

.add-food-btn:hover {
  background: #218838;
  transform: translateY(-2px);
}

.load-sample-btn {
  background: #17a2b8;
  color: white;
}

.load-sample-btn:hover {
  background: #138496;
  transform: translateY(-2px);
}

.test-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.test-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.test-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.response-section {
  border-top: 2px solid #f0f0f0;
  padding-top: 20px;
}

.response-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.response-header h3 {
  color: #333;
  margin: 0;
}

.clear-btn {
  background: #6c757d;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.3s;
}

.clear-btn:hover {
  background: #5a6268;
}

.response-content {
  background: #f8f9fa;
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  padding: 20px;
  max-height: 600px;
  overflow-y: auto;
  text-align: left;
}

.response-content pre {
  font-family: "Courier New", monospace;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  margin: 0;
  text-align: left;
}

.success-message {
  color: #155724;
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 5px;
  padding: 10px;
  margin-top: 15px;
  font-weight: 600;
}

.error-message {
  color: #721c24;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 5px;
  padding: 10px;
  margin-top: 15px;
  font-weight: 600;
}

.no-response {
  background: #f8f9fa;
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  color: #666;
  font-style: italic;
}
</style>
