const express = require("express");

const router = express.Router();

const {
  getNutrition,
  getAllNutrition,
  testAtlasSearch,
} = require("../controllers/nutritionController");

router.get("/nutrition", getNutrition);
router.get("/nutrition/all", getAllNutrition);
router.get("/nutrition/test-search", testAtlasSearch);

module.exports = router;
