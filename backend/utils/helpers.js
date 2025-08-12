const pluralize = require("pluralize");

// Constants
const knownUnits = [
  "ml",
  "g",
  "kg",
  "mg",
  "litre",
];

const unknownUnits = [
  "cup",
  "plate",
  "glass",
  "slice",
  "piece",
  "bowl",
  "bottle",
  "dozen",
  "can",
  "jar",
  "box",
  "bag",
  "tube",
  "packet",
  "container",
  "clove",
  "carton"
];

// Utility Functions
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

module.exports = {
  normalizeFoodName,
  parseFoodInput,
  knownUnits,
  unknownUnits,
};
