const pluralize = require("pluralize");

// ============================================================================
// CONSTANTS
// ============================================================================

const knownUnits = [
  "ml",
  "g",
  "kg",
  "mg",
  "litre",
  "l", // Add "l" as an alias for litre
];

const unknownUnits = [
  "medium", 
  "small",
  "large",
  "bag",
  "bottle",
  "bowl",
  "box",
  "can",
  "carton",
  "clove",
  "container",
  "cube",
  "cup",
  "dessertsspoon",
  "dozen",
  "each",
  "gallon",
  "glass",
  "jar",
  "metric cup",
  "ounce",
  "package",
  "packet",
  "piece",
  "pint",
  "plate",
  "pot",
  "pouch",
  "pound",
  "punnet",
  "quart",
  "scoop",
  "serving",
  "slice",
  "stich",
  "tablespoon",
  "tablet",
  "teaspoon",
  "tube"
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Normalizes food names by removing numbers, extra spaces, and handling plurals
 */
function normalizeFoodName(name) {
  let clean = name
    .toLowerCase()
    .replace(/^[0-9]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
    
  if (clean.endsWith("ies") && clean.length > 4) {
    clean = clean.slice(0, -3) + "y";
  } else if (
    (clean.endsWith("ses") ||
      clean.endsWith("xes") ||
      clean.endsWith("zes") ||
      clean.endsWith("ches") ||
      clean.endsWith("shes")) &&
    clean.length > 4
  ) {
    clean = clean.slice(0, -2);
  } else if (clean.endsWith("s") && !clean.endsWith("ss") && clean.length > 4) {
    clean = clean.slice(0, -1);
  }
  
  return clean;
}

/**
 * Parses food input to extract quantity, unit, and food name
 * Examples:
 * - "2 cups of milk" -> { number: 2, quantity: "cup", food: "milk" }
 * - "500 ml water" -> { number: 500, quantity: "ml", food: "water" }
 * - "3 bread" -> { number: 3, quantity: null, food: "bread" }
 */
function parseFoodInput(input) {
  input = input.trim().toLowerCase();

  const regex = /^(\d+(?:\.\d+)?)\s*(\w+)?(?:\s+of)?\s+(.*)$/;
  const match = input.match(regex);

  if (!match) return null;

  const number = parseFloat(match[1]);
  const possibleUnit = match[2];
  const rest = match[3].trim();

  let quantity = null;
  let food = "";

  if (possibleUnit && (knownUnits.includes(pluralize.singular(possibleUnit)) || unknownUnits.includes(pluralize.singular(possibleUnit)))) {
    quantity = pluralize.singular(possibleUnit);
    food = pluralize.singular(rest);
  } else {
    quantity = null;
    const combined = (possibleUnit ? possibleUnit + " " : "") + rest;
    food = pluralize.singular(combined.trim());
  }

  return {
    number,
    quantity,
    food,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constants
  knownUnits,
  unknownUnits,
  
  // Utility functions
  normalizeFoodName,
  parseFoodInput,
};
