const BN_TO_ASCII_DIGITS = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

function escapeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDigits(value = "") {
  return String(value).replace(/[০-৯]/g, (digit) => BN_TO_ASCII_DIGITS[digit] ?? digit);
}

function parseIntOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(normalizeDigits(String(value)), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeListParam(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildRegexFilter(value) {
  if (!value) return null;
  return {
    $regex: escapeRegex(String(value).trim()),
    $options: "i",
  };
}

module.exports = {
  buildRegexFilter,
  escapeRegex,
  normalizeDigits,
  normalizeListParam,
  parseIntOrNull,
};
