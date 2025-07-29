<template>
  <div id="app">
    <h1>Nutrina - Nutrition Tracker</h1>
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

        <!-- Display parsed input information -->
        <div v-if="foodData.parsedInput" class="parsed-info">
          <p class="parsed-details">
            <strong>Parsed:</strong> 
            {{ foodData.parsedInput.number }} 
            {{ foodData.parsedInput.quantity || '' }} 
            {{ foodData.parsedInput.food }}
          </p>
        </div>

        <!-- Show base nutrition info if available -->
        <div v-if="foodData.baseNutrition && foodData.parsedInput && foodData.parsedInput.number > 1" class="base-nutrition">
          <p class="base-info">
            <small>
              <strong>Base nutrition:</strong> 
              {{ Math.round(getEnergyValue(
                foodData.baseNutrition.foodNutrients,
                foodData.baseNutrition
              ) * 100) / 100 }} calories per {{ foodData.baseNutrition.servingSize || foodData.baseNutrition.totalWeight || 1 }}{{ foodData.baseNutrition.servingSizeUnit || 'g' }}
            </small>
          </p>
        </div>

        <p class="calories" v-if="foodData">
          {{
            Math.round(getEnergyValue(
              foodData.foodNutrients || foodData.response?.foodNutrients || foodData.nutrients?.foodNutrients,
              foodData.response || foodData
            ) * 100) / 100
          }} calories
        </p>
        <p class="weight" v-if="foodData">
          {{
            foodData.totalWeight
              ?? foodData.response?.totalWeight
              ?? foodData.nutrients?.totalWeight
              ?? foodData.servingSize
              ?? foodData.response?.servingSize
              ?? foodData.nutrients?.servingSize
              ?? ''
          }} {{ foodData.servingSizeUnit || foodData.response?.servingSizeUnit || foodData.nutrients?.servingSizeUnit || 'grams' }}
        </p>
      </div>

      <!-- <div class="nutrition-grid">
        <div class="nutrition-section">
          <h3> Macronutrients</h3>
          <div class="nutrient-item">
            <span>Protein:</span>
            <span>{{ foodData.data.macronutrients.protein }}</span>
          </div>
          <div class="nutrient-item">
            <span>Fat:</span>
            <span>{{ foodData.data.macronutrients.fat }}</span>
          </div>
          <div class="nutrient-item">
            <span>Carbohydrates:</span>
            <span>{{ foodData.data.macronutrients.carbohydrates }}</span>
          </div>
         
        
        </div>
        
      
          <h3> Micronutrients</h3>
          <div class="nutrient-item">
            <span>Sodium:</span>
            <span>{{ foodData.data.micronutrients.sodium }}</span>
          </div>
          <div class="nutrient-item">
            <span>Potassium:</span>
            <span>{{ foodData.data.micronutrients.potassium }}</span>
          </div>
          <div class="nutrient-item">
            <span>Calcium:</span>
            <span>{{ foodData.data.micronutrients.calcium }}</span>
          </div>
          <div class="nutrient-item">
            <span>Iron:</span>
            <span>{{ foodData.data.micronutrients.iron }}</span>
          </div>
          <div class="nutrient-item">
            <span>Cholesterol:</span>
            <span>{{ foodData.data.micronutrients.cholesterol }}</span>
          </div>
        </div> -->
    </div>

    <!-- <div class="message">
      <p></p>
    </div> -->
    <div v-if="allNutrition.length > 0" class="all-nutrition">
      <h2>All Foods in the Database</h2>
      <div class="nutrition-table-wrapper">
        <table class="nutrition-table">
          <thead>
            <tr>
              <th>Food Name</th>
              <th>Calories</th>
              <th>Serving Size</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="nutrition in allNutrition" :key="nutrition._id">
              <td>{{ nutrition.name }}</td>
              <td>
                {{ nutrition.nutrients.calories ? Math.round(nutrition.nutrients.calories * 100) / 100 : Math.round(getEnergyValue(nutrition.nutrients.foodNutrients) * 100) / 100 }}
              </td>
              <td>
                {{ nutrition.servingSize || nutrition.nutrients.servingSize || 1 }} {{ nutrition.servingSizeUnit || nutrition.nutrients.servingSizeUnit || 'g' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <!-- <div v-else class="no-nutrition-msg">
        <p>No foods found in the database.</p>
      </div> -->
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from "vue";

const searchQuery = ref("");
const foodData = ref(null);
const loading = ref(false);
const error = ref(null);
const foodItems = ref(null);
const allNutrition = ref([]);

const getEnergyValue = (foodNutrients, data) => {
  // 1. Edamam: calories at top level
  if (data && typeof data.calories === 'number' && data.calories > 0) {
    return data.calories;
  }
  // 2. Edamam: calories in totalNutrients
  if (data && data.totalNutrients && data.totalNutrients.ENERC_KCAL && typeof data.totalNutrients.ENERC_KCAL.quantity === 'number') {
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
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
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

.nutrition-table th, .nutrition-table td {
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

.nutrition-table td, .nutrition-table th {
  border-right: 1px solid #f0f0f0;
}

.nutrition-table tr td:last-child,
.nutrition-table tr th:last-child {
  border-right: none;
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
}
</style>
