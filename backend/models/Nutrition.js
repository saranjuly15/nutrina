const mongoose = require('mongoose');

const nutritionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    nutrients: {
        calories: { type: Number, default: 0 },
        protein: { type: Number, default: 0 },
        fat: { type: Number, default: 0 },
        carbohydrates: { type: Number, default: 0 },
        fiber: { type: Number, default: 0 },
        sugar: { type: Number, default: 0 },
        sodium: { type: Number, default: 0 },
        cholesterol: { type: Number, default: 0 },
        potassium: { type: Number, default: 0 },
        calcium: { type: Number, default: 0 },
        iron: { type: Number, default: 0 },
        vitaminA: { type: Number, default: 0 },
        vitaminC: { type: Number, default: 0 },
        vitaminD: { type: Number, default: 0 },
        vitaminE: { type: Number, default: 0 },
        vitaminB12: { type: Number, default: 0 },
        folate: { type: Number, default: 0 },
        magnesium: { type: Number, default: 0 },
        phosphorus: { type: Number, default: 0 },
        zinc: { type: Number, default: 0 },
        copper: { type: Number, default: 0 },
        manganese: { type: Number, default: 0 },
        selenium: { type: Number, default: 0 }
    },
    nutritionUnits: {
        calories: { type: String, default: 'KCAL' },
        protein: { type: String, default: 'G' },
        fat: { type: String, default: 'G' },
        carbohydrates: { type: String, default: 'G' },
        fiber: { type: String, default: 'G' },
        sugar: { type: String, default: 'G' },
        sodium: { type: String, default: 'MG' },
        cholesterol: { type: String, default: 'MG' },
        potassium: { type: String, default: 'MG' },
        calcium: { type: String, default: 'MG' },
        iron: { type: String, default: 'MG' },
        vitaminA: { type: String, default: 'UG' },
        vitaminC: { type: String, default: 'MG' },
        vitaminD: { type: String, default: 'UG' },
        vitaminE: { type: String, default: 'MG' },
        vitaminB12: { type: String, default: 'UG' },
        folate: { type: String, default: 'UG' },
        magnesium: { type: String, default: 'MG' },
        phosphorus: { type: String, default: 'MG' },
        zinc: { type: String, default: 'MG' },
        copper: { type: String, default: 'MG' },
        manganese: { type: String, default: 'MG' },
        selenium: { type: String, default: 'UG' }
    },
    baseServingSize: {
        type: Number,
        default: 1,
    },
    baseServingUnit: {
        type: String,
        default: 'g',
    },
    // Updated to support multiple household servings
    householdServings: [{
        servingSize: { type: Number, required: true },
        servingUnit: { type: String, required: true }
    }],
    fromUSDA: {
        type: Boolean,
        default: false,
    },
    fromEdamam: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Nutrition', nutritionSchema);