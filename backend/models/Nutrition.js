const mongoose = require('mongoose');

const nutritionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    nutrients: {
        type: Object,
        required: true,
        default: {},
    },
    servingSize: {
        type: Number,
        default: 1,
    },
    servingSizeUnit: {
        type: String,
        default: 'g',
    },
    householdServingInfo: {
        householdServing: String,
        servingQuantity: Number,
        matchedFood: String
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Nutrition', nutritionSchema);