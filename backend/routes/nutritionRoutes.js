const express = require("express");

const router = express.Router();

const {
  getNutrition,
  getAllNutrition,
} = require("../controllers/nutritionController");

router.get("/nutrition", getNutrition);
router.get("/nutrition/all", getAllNutrition);


module.exports = router;
