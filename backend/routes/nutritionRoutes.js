const express = require("express");

const router = express.Router();

const {
  getNutrition,
  getAllNutrition,
  getBulkNutrition,
} = require("../controllers/nutritionController");

router.get("/nutrition", getNutrition);
router.post("/nutrition/bulk", getBulkNutrition);
router.get("/nutrition/all", getAllNutrition);


module.exports = router;
