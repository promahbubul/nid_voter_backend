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
const DEFAULT_TEXT_MAX_LENGTH = 120;
const DEFAULT_LIST_MAX_ITEMS = 25;
const DEFAULT_LIST_ITEM_MAX_LENGTH = 80;

function escapeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDigits(value = "") {
  return String(value).replace(/[০-৯]/g, (digit) => BN_TO_ASCII_DIGITS[digit] ?? digit);
}

function normalizeTextValue(value, options = {}) {
  if (value == null) return "";

  const normalized = String(value)
    .trim()
    .replace(/\s+/g, " ");
  if (!normalized) return "";

  const maxLength = options.maxLength ?? DEFAULT_TEXT_MAX_LENGTH;
  return normalized.slice(0, maxLength);
}

function parseIntOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(normalizeDigits(String(value)), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeListParam(value, options = {}) {
  if (!value) return [];

  const maxItems = options.maxItems ?? DEFAULT_LIST_MAX_ITEMS;
  const maxItemLength = options.maxItemLength ?? DEFAULT_LIST_ITEM_MAX_LENGTH;
  const rawValues = Array.isArray(value) ? value.flatMap((item) => String(item).split(",")) : String(value).split(",");
  const normalizedValues = rawValues
    .map((item) => normalizeTextValue(item, { maxLength: maxItemLength }))
    .filter(Boolean);

  return [...new Set(normalizedValues)].slice(0, maxItems);
}

function buildRegexFilter(value, options = {}) {
  const normalizedValue = normalizeTextValue(value, { maxLength: options.maxLength ?? DEFAULT_TEXT_MAX_LENGTH });
  if (!normalizedValue) return null;

  return {
    $regex: escapeRegex(normalizedValue),
    $options: "i",
  };
}

module.exports = {
  buildRegexFilter,
  escapeRegex,
  normalizeDigits,
  normalizeListParam,
  normalizeTextValue,
  parseIntOrNull,
};
