const { getDb } = require("../config/db");
const { buildRegexFilter, normalizeDigits, normalizeListParam, normalizeTextValue, parseIntOrNull } = require("../utils/query");

const MAX_VOTER_PAGE_SIZE = 100;
const MAX_LOOKUP_LIMIT = 500;
const MAX_SEARCH_LENGTH = 80;
const MAX_EXACT_MATCH_LENGTH = 64;

const VOTER_RESULT_PROJECTION = {
  _id: 1,
  source_path: 1,
  source_folder: 1,
  voter_area_code: 1,
  voter_area_name_raw: 1,
  district_raw: 1,
  upazila_raw: 1,
  union_or_board_raw: 1,
  ward_no: 1,
  gender: 1,
  list_type: 1,
  part_no: 1,
  serial: 1,
  record_status: 1,
  special_tag: 1,
  migration_status_raw: 1,
  name_raw: 1,
  voter_no: 1,
  father_name_raw: 1,
  mother_name_raw: 1,
  occupation_raw: 1,
  address_raw: 1,
  birth_date_raw: 1,
  birth_date: 1,
  birth_year: 1,
  publish_date: 1,
};

function extractWardFromSourceFolder(sourceFolder) {
  const match = /^WARD NO-0?(\d{1,2})$/i.exec(String(sourceFolder || "").trim());
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function normalizeWardNumber(value, sourceFolder) {
  const derivedWard = extractWardFromSourceFolder(sourceFolder);
  if (derivedWard != null) return derivedWard;

  const parsedWard = parseIntOrNull(value);
  if (parsedWard == null) return null;
  if (parsedWard >= 1 && parsedWard <= 99) return parsedWard;
  return null;
}

function buildWardFilter(wardNo) {
  const normalizedWard = parseIntOrNull(wardNo);
  if (normalizedWard == null) return null;

  const folderWard = normalizedWard.toString().padStart(2, "0");
  return {
    $or: [{ ward_no: normalizedWard }, { source_folder: `WARD NO-${folderWard}` }, { source_folder: `WARD NO-${normalizedWard}` }],
  };
}

function normalizeVoterRecord(item) {
  return {
    ...item,
    ward_no: normalizeWardNumber(item.ward_no, item.source_folder),
  };
}

function normalizeAreaRecord(item) {
  return {
    ...item,
    ward_no: normalizeWardNumber(item.ward_no, item.source_folder),
  };
}

function applyInFilter(query, field, values) {
  if (values.length === 1) query[field] = values[0];
  if (values.length > 1) query[field] = { $in: values };
}

function appendAndCondition(query, condition) {
  if (!condition) return;
  query.$and = query.$and || [];
  query.$and.push(condition);
}

function buildVoterQuery(params) {
  const query = {};

  applyInFilter(query, "source_folder", normalizeListParam(params.sourceFolder, { maxItems: 20, maxItemLength: MAX_EXACT_MATCH_LENGTH }));
  applyInFilter(query, "voter_area_code", normalizeListParam(params.areaCode, { maxItems: 20, maxItemLength: MAX_EXACT_MATCH_LENGTH }));
  applyInFilter(query, "source_path", normalizeListParam(params.sourcePath, { maxItems: 20, maxItemLength: 160 }));
  applyInFilter(query, "gender", normalizeListParam(params.gender, { maxItems: 5, maxItemLength: 16 }));
  applyInFilter(query, "record_status", normalizeListParam(params.recordStatus, { maxItems: 5, maxItemLength: 24 }));
  applyInFilter(query, "special_tag", normalizeListParam(params.specialTag, { maxItems: 10, maxItemLength: 24 }));

  const wardFilter = buildWardFilter(params.wardNo ?? params.ward ?? params.word);
  appendAndCondition(query, wardFilter);

  const partNo = parseIntOrNull(params.partNo);
  if (partNo != null) query.part_no = partNo;

  const birthYearFrom = parseIntOrNull(params.birthYearFrom);
  const birthYearTo = parseIntOrNull(params.birthYearTo);
  if (birthYearFrom != null || birthYearTo != null) {
    query.birth_year = {};
    if (birthYearFrom != null) query.birth_year.$gte = birthYearFrom;
    if (birthYearTo != null) query.birth_year.$lte = birthYearTo;
  }

  const publishDate = normalizeTextValue(params.publishDate, { maxLength: 32 });
  if (publishDate) query.publish_date = publishDate;

  const birthDate = normalizeTextValue(params.birthDate ?? params.dob, { maxLength: 32 });
  if (birthDate) query.birth_date = birthDate;

  if (params.voterNo ?? params.voterNumber) {
    query.voter_no = normalizeDigits(normalizeTextValue(params.voterNo ?? params.voterNumber, { maxLength: 32 }));
  }

  const districtFilter = buildRegexFilter(params.zilaName ?? params.district, { maxLength: MAX_SEARCH_LENGTH });
  if (districtFilter) query.district_raw = districtFilter;

  const upazilaFilter = buildRegexFilter(params.upozilaName ?? params.upazila, { maxLength: MAX_SEARCH_LENGTH });
  if (upazilaFilter) query.upazila_raw = upazilaFilter;

  const occupationFilter = buildRegexFilter(params.occupation, { maxLength: MAX_SEARCH_LENGTH });
  if (occupationFilter) query.occupation_raw = occupationFilter;

  const nameFilter = buildRegexFilter(params.name, { maxLength: MAX_SEARCH_LENGTH });
  if (nameFilter) query.name_raw = nameFilter;

  const fatherFilter = buildRegexFilter(params.fatherName, { maxLength: MAX_SEARCH_LENGTH });
  if (fatherFilter) query.father_name_raw = fatherFilter;

  const motherFilter = buildRegexFilter(params.motherName, { maxLength: MAX_SEARCH_LENGTH });
  if (motherFilter) query.mother_name_raw = motherFilter;

  const areaFilter = buildRegexFilter(params.area, { maxLength: MAX_SEARCH_LENGTH });
  if (areaFilter) {
    appendAndCondition(query, {
      $or: [
        { source_folder: areaFilter },
        { voter_area_name_raw: areaFilter },
        { voter_area_code: areaFilter },
      ],
    });
  }

  const generalFilter = buildRegexFilter(normalizeDigits(params.q), { maxLength: MAX_SEARCH_LENGTH });
  if (generalFilter) {
    appendAndCondition(query, {
      $or: [
        { name_raw: generalFilter },
        { father_name_raw: generalFilter },
        { mother_name_raw: generalFilter },
        { address_raw: generalFilter },
        { voter_area_name_raw: generalFilter },
        { source_folder: generalFilter },
        { voter_no: generalFilter },
        { district_raw: generalFilter },
        { upazila_raw: generalFilter },
      ],
    });
  }

  return query;
}

function buildSort(sortBy, sortOrder) {
  const allowed = new Set([
    "source_folder",
    "voter_area_code",
    "ward_no",
    "gender",
    "serial",
    "birth_year",
    "publish_date",
  ]);

  const normalizedSortBy = normalizeTextValue(sortBy, { maxLength: 32 });
  const field = allowed.has(normalizedSortBy) ? normalizedSortBy : "serial";
  const direction = String(sortOrder || "").trim().toLowerCase() === "desc" ? -1 : 1;

  if (field === "serial") {
    return { voter_area_code: 1, gender: 1, serial: direction };
  }

  return { [field]: direction, serial: 1 };
}

async function listVoters(params) {
  const db = getDb();
  const voters = db.collection("voters");
  const page = Math.max(parseIntOrNull(params.page) || 1, 1);
  const limit = Math.min(Math.max(parseIntOrNull(params.limit) || 50, 1), MAX_VOTER_PAGE_SIZE);
  const skip = (page - 1) * limit;
  const query = buildVoterQuery(params);
  const sort = buildSort(params.sortBy, params.sortOrder);

  const [items, total] = await Promise.all([
    voters.find(query, { projection: VOTER_RESULT_PROJECTION }).sort(sort).skip(skip).limit(limit).toArray(),
    voters.countDocuments(query),
  ]);

  return {
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
    items: items.map(normalizeVoterRecord),
  };
}

async function listAreas(params) {
  const db = getDb();
  const areas = db.collection("areas");
  const limit = Math.min(Math.max(parseIntOrNull(params.limit) || 100, 1), MAX_LOOKUP_LIMIT);
  const query = {};

  const sourceFolder = normalizeTextValue(params.sourceFolder, { maxLength: MAX_EXACT_MATCH_LENGTH });
  if (sourceFolder) query.source_folder = sourceFolder;

  const wardFilter = buildWardFilter(params.wardNo ?? params.ward ?? params.word);
  appendAndCondition(query, wardFilter);

  const areaFilter = buildRegexFilter(params.area ?? params.q, { maxLength: MAX_SEARCH_LENGTH });
  if (areaFilter) {
    query.$or = [
      { source_folder: areaFilter },
      { voter_area_name_raw: areaFilter },
      { voter_area_code: areaFilter },
    ];
  }

  const items = await areas
    .find(query)
    .sort({ source_folder: 1, ward_no: 1, voter_area_code: 1 })
    .limit(limit)
    .toArray();

  return {
    limit,
    total: items.length,
    items: items.map(normalizeAreaRecord),
  };
}

async function listSourceFiles(params) {
  const db = getDb();
  const sourceFiles = db.collection("source_files");
  const limit = Math.min(Math.max(parseIntOrNull(params.limit) || 100, 1), MAX_LOOKUP_LIMIT);
  const query = {};

  const sourceFolder = normalizeTextValue(params.sourceFolder, { maxLength: MAX_EXACT_MATCH_LENGTH });
  if (sourceFolder) query.source_folder = sourceFolder;

  const areaCode = normalizeTextValue(params.areaCode, { maxLength: MAX_EXACT_MATCH_LENGTH });
  if (areaCode) query.voter_area_code = areaCode;

  const items = await sourceFiles
    .find(query)
    .sort({ source_folder: 1, voter_area_code: 1, gender: 1 })
    .limit(limit)
    .toArray();

  return {
    limit,
    total: items.length,
    items,
  };
}

async function getStats() {
  const db = getDb();
  return db.collection("summary").findOne({ _id: "latest" });
}

async function getHealth() {
  const db = getDb();
  const [voters, areas, sourceFiles] = await Promise.all([
    db.collection("voters").estimatedDocumentCount(),
    db.collection("areas").estimatedDocumentCount(),
    db.collection("source_files").estimatedDocumentCount(),
  ]);

  return {
    ok: true,
    database: db.databaseName,
    voters,
    areas,
    source_files: sourceFiles,
  };
}

async function getOverview() {
  const db = getDb();
  const [summary, activeVoters, migratedVoters] = await Promise.all([
    db.collection("summary").findOne(
      { _id: "latest" },
      {
        projection: {
          _id: 0,
          total_pdf_files: 1,
          total_voter_records: 1,
          total_declared_voters_from_filenames: 1,
          total_area_documents: 1,
          total_source_folders: 1,
          gender_totals: 1,
          per_folder_totals: 1,
          normalization: 1,
          generated_at: 1,
          imported_at: 1,
        },
      },
    ),
    db.collection("voters").countDocuments({ record_status: "active" }),
    db.collection("voters").countDocuments({ record_status: "migrated" }),
  ]);

  const topAreas = [...(summary?.per_folder_totals || [])]
    .sort((left, right) => right.declared_voters - left.declared_voters)
    .slice(0, 6)
    .map((item) => ({
      source_folder: item.source_folder,
      voters: item.declared_voters,
      files: item.files,
      male: item.male,
      female: item.female,
      hijra: item.hijra,
    }));

  return {
    totals: {
      totalVoters: summary?.total_voter_records || 0,
      declaredVoters: summary?.total_declared_voters_from_filenames || 0,
      activeVoters,
      migratedVoters,
      totalAreas: summary?.total_area_documents || 0,
      totalSourceFolders: summary?.total_source_folders || 0,
      totalFiles: summary?.total_pdf_files || 0,
    },
    genderTotals: summary?.gender_totals || {},
    topAreas,
    normalization: summary?.normalization || null,
    generatedAt: summary?.generated_at || null,
    importedAt: summary?.imported_at || null,
  };
}

module.exports = {
  getHealth,
  getOverview,
  getStats,
  listAreas,
  listSourceFiles,
  listVoters,
};
