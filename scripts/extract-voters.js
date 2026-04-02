const fs = require("node:fs");
const { once } = require("node:events");
const path = require("node:path");
const { PDFParse } = require("pdf-parse");

const ROOT_DIR = path.resolve(__dirname, "../..");
const OUTPUT_DIR = path.join(ROOT_DIR, "output");
const SKIP_DIRS = new Set(["node_modules", "output", "scripts"]);
const CONCURRENCY = 4;

const BN_TO_ASCII = {
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

function toAsciiDigits(value = "") {
  return String(value).replace(/[০-৯]/g, (digit) => BN_TO_ASCII[digit] ?? digit);
}

function parseBnInteger(value) {
  if (value == null) return null;
  const normalized = toAsciiDigits(String(value)).replace(/[^\d-]/g, "");
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseBnDate(value) {
  if (!value) return null;
  const normalized = toAsciiDigits(String(value));
  const match = normalized.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeLine(value) {
  return String(value)
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function listPdfFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      results.push(...listPdfFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
      results.push(fullPath);
    }
  }
  return results.sort((a, b) => a.localeCompare(b));
}

function parseFilename(filename) {
  const match = filename.match(
    /^(?:(\d+)-\s*)?(\d+)_com_(\d+)_(male|female|hijra)_without_photo_(\d+)_(\d{4}-\d{1,2}-\d{1,2})\.pdf$/i,
  );

  if (!match) {
    throw new Error(`Unrecognized filename format: ${filename}`);
  }

  return {
    part_no: match[1] ? Number.parseInt(match[1], 10) : null,
    voter_area_code: match[2],
    declared_category_voters: Number.parseInt(match[3], 10),
    gender: match[4].toLowerCase(),
    page_count_from_filename: Number.parseInt(match[5], 10),
    publish_date_from_filename: match[6],
  };
}

function maybeAfterLabel(line, labelFragment) {
  const index = line.indexOf(labelFragment);
  if (index === -1) return null;
  return line.slice(index + labelFragment.length).trim();
}

function looksLikePageMarker(line) {
  return /^--\s*\d+\s+of\s+\d+\s*--$/.test(line);
}

function looksLikeStandalonePageNumber(line) {
  return /^[০-৯0-9]+$/.test(line);
}

function isHeaderOrFooterLine(line) {
  if (!line) return true;
  if (looksLikePageMarker(line) || looksLikeStandalonePageNumber(line)) return true;
  if (line.startsWith("বাংলা")) return true;
  if (line.includes("কিমশন")) return true;
  if (line.includes("চূড়া") && line.includes("তািলকা")) return true;
  if (line === "ফরম-১") return true;
  if (line.includes("ছিব ছাড়া")) return true;
  if (line === "পুƁষ" || line === "মিহলা" || line === "িহজড়া") return true;
  if (line.startsWith("অûল:")) return true;
  if (line.startsWith("িসিট ")) return true;
  if (line.startsWith("ওয়াড") && line.includes("ডাকঘর")) return true;
  if (line.startsWith("Ïভাটার এলাকার নাম")) return true;
  if (line.startsWith("Ïজলা:") && line.includes("উপেজলা")) return true;
  if (line.includes("Ïরিজে") && line.includes("অিফসার")) return true;
  return false;
}

function extractHeaderMetadata(lines, fileMeta, relativePath, topFolder) {
  const metadata = {
    source_path: relativePath.replace(/\\/g, "/"),
    source_folder: topFolder,
    voter_area_code: fileMeta.voter_area_code,
    gender: fileMeta.gender,
    part_no: fileMeta.part_no,
    page_count: fileMeta.page_count_from_filename,
    publish_date: fileMeta.publish_date_from_filename,
    publish_date_raw: null,
    district_raw: null,
    upazila_raw: null,
    union_or_board_raw: null,
    voter_area_name_raw: null,
    ward_no: null,
    declared_total_voters: null,
    declared_category_voters: fileMeta.declared_category_voters,
    ocv_count: null,
    icpv_count: null,
  };

  for (const line of lines) {
    if (!metadata.publish_date_raw && line.includes("তািরখ")) {
      const match = line.match(/([০-৯]{1,2}\/[০-৯]{1,2}\/[০-৯]{4})/);
      if (match) {
        metadata.publish_date_raw = match[1];
        metadata.publish_date = parseBnDate(match[1]) ?? metadata.publish_date;
      }
    }

    if (!metadata.declared_total_voters && line.includes("সব") && line.includes("ভাটার সংখ")) {
      const match = line.match(/([০-৯]{1,6})$/);
      if (match) {
        metadata.declared_total_voters = parseBnInteger(match[1]);
      }
    }

    if (line.includes("OCV")) {
      const match = line.match(/([০-৯]{1,6})$/);
      if (match) metadata.ocv_count = parseBnInteger(match[1]);
    }

    if (line.includes("ICPV")) {
      const match = line.match(/([০-৯]{1,6})$/);
      if (match) metadata.icpv_count = parseBnInteger(match[1]);
    }

    if (!metadata.ward_no && line.startsWith("ওয়াড")) {
      const match = line.match(/([০-৯]{1,3})$/);
      if (match) metadata.ward_no = parseBnInteger(match[1]);
    }

    if (!metadata.district_raw && line.includes("জলা:")) {
      const after = maybeAfterLabel(line, "জলা:");
      if (after) {
        metadata.district_raw = after.split("উপেজলা/থানা")[0].trim();
      }
    }

    if (!metadata.upazila_raw) {
      if (line.includes("উপেজলা/থানা:")) {
        const after = maybeAfterLabel(line, "উপেজলা/থানা:");
        if (after) metadata.upazila_raw = after.split("ইউিনয়ন")[0].trim();
      } else if (line.startsWith("উপেজলা/থানা ")) {
        metadata.upazila_raw = line.slice("উপেজলা/থানা ".length).trim();
      }
    }

    if (!metadata.union_or_board_raw) {
      if (line.includes("Ïবাঃ :")) {
        const after = maybeAfterLabel(line, "Ïবাঃ :");
        if (after) metadata.union_or_board_raw = after.trim();
      } else if (line.startsWith("কËা") || line.startsWith("ইউিনয়ন/")) {
        const candidate = line.split("ÏবাডÎ").pop()?.trim();
        if (candidate && candidate !== line) {
          metadata.union_or_board_raw = candidate;
        }
      }
    }

    if (!metadata.voter_area_name_raw) {
      if (line.startsWith("Ïভাটার এলাকার নাম")) {
        const match = line.match(/নাম\s*:\s*(.+?)\s+Ïভাটার এলাকার ন/);
        if (match) {
          metadata.voter_area_name_raw = match[1].trim();
        }
      } else if (line.startsWith("Ïভাটার এলাকা ")) {
        metadata.voter_area_name_raw = line.slice("Ïভাটার এলাকা ".length).trim();
      }
    }
  }

  return metadata;
}

function parseOccupationAndBirth(line) {
  const afterColon = line.includes(":") ? line.slice(line.indexOf(":") + 1).trim() : line;
  const dateMatch = afterColon.match(/([০-৯]{1,2}\/[০-৯]{1,2}\/[০-৯]{4})/);
  const birthDateRaw = dateMatch ? dateMatch[1] : null;
  let occupationRaw = afterColon;

  if (dateMatch) {
    occupationRaw = afterColon.slice(0, dateMatch.index).trim();
  }

  occupationRaw = occupationRaw.replace(/,\s*জ.*$/u, "").trim();
  occupationRaw = occupationRaw.replace(/,\s*$/, "").trim();

  return {
    occupation_raw: occupationRaw || null,
    birth_date_raw: birthDateRaw,
    birth_date: parseBnDate(birthDateRaw),
  };
}

function finalizeRecord(record, header) {
  if (!record) {
    return null;
  }

  const isMigrated = Boolean(record.migrated || record.migration_status_raw);
  if (!record.voter_no && !isMigrated) {
    return null;
  }

  const serial = parseBnInteger(record.serial_bn);
  const birthYear = record.birth_date ? Number.parseInt(record.birth_date.slice(0, 4), 10) : null;
  const voterId = record.voter_no ? toAsciiDigits(record.voter_no) : null;

  return {
    _id: `${header.voter_area_code}_${header.gender}_${String(serial ?? "0").padStart(4, "0")}_${voterId ?? (isMigrated ? "migrated" : "unknown")}`,
    source_path: header.source_path,
    source_folder: header.source_folder,
    voter_area_code: header.voter_area_code,
    voter_area_name_raw: header.voter_area_name_raw,
    district_raw: header.district_raw,
    upazila_raw: header.upazila_raw,
    union_or_board_raw: header.union_or_board_raw,
    ward_no: header.ward_no,
    gender: header.gender,
    list_type: "without_photo",
    part_no: header.part_no,
    publish_date: header.publish_date,
    serial_bn: record.serial_bn,
    serial,
    special_tag: record.special_tag ?? null,
    record_status: isMigrated ? "migrated" : "active",
    migration_status_raw: record.migration_status_raw ?? null,
    name_raw: record.name_raw,
    voter_no: voterId,
    father_name_raw: record.father_name_raw ?? null,
    mother_name_raw: record.mother_name_raw ?? null,
    occupation_raw: record.occupation_raw ?? null,
    birth_date_raw: record.birth_date_raw ?? null,
    birth_date: record.birth_date ?? null,
    birth_year: birthYear,
    address_raw: record.address_raw?.trim() || null,
  };
}

function parseVoterRecords(lines, header) {
  const recordStartRe = /^(?:(OCV|ICPV)\s+)?([০-৯]+)\.\s*নাম:\s*(.+)$/;
  const migratedStartRe = /^(?:(OCV|ICPV)\s+)?([০-৯]+)\.$/;
  const results = [];
  let current = null;
  let pendingSpecialTag = null;

  const pushCurrent = () => {
    const finalized = finalizeRecord(current, header);
    if (finalized) {
      results.push(finalized);
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    if (line === "OCV" || line === "ICPV") {
      pendingSpecialTag = line;
      continue;
    }

    const recordMatch = line.match(recordStartRe);
    if (recordMatch) {
      pushCurrent();
      current = {
        serial_bn: recordMatch[2],
        special_tag: recordMatch[1] ?? pendingSpecialTag ?? null,
        migrated: false,
        migration_status_raw: null,
        name_raw: recordMatch[3].trim(),
        voter_no: null,
        father_name_raw: null,
        mother_name_raw: null,
        occupation_raw: null,
        birth_date_raw: null,
        birth_date: null,
        address_raw: null,
      };
      pendingSpecialTag = null;
      continue;
    }

    const migratedMatch = line.match(migratedStartRe);
    if (migratedMatch) {
      pushCurrent();
      current = {
        serial_bn: migratedMatch[2],
        special_tag: migratedMatch[1] ?? pendingSpecialTag ?? null,
        migrated: true,
        migration_status_raw: null,
        name_raw: null,
        voter_no: null,
        father_name_raw: null,
        mother_name_raw: null,
        occupation_raw: null,
        birth_date_raw: null,
        birth_date: null,
        address_raw: null,
      };
      pendingSpecialTag = null;
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.includes("নং:")) {
      const match = line.match(/([০-৯]{6,})/);
      if (match) {
        current.voter_no = match[1];
      }
      continue;
    }

    if (line.includes("িপতা:")) {
      current.father_name_raw = line.slice(line.indexOf("িপতা:") + "িপতা:".length).trim();
      continue;
    }

    if (line.includes("মাতা:")) {
      current.mother_name_raw = line.slice(line.indexOf("মাতা:") + "মাতা:".length).trim();
      continue;
    }

    if (line.includes("তািরখ") && !current.birth_date_raw) {
      const parsed = parseOccupationAndBirth(line);
      current.occupation_raw = parsed.occupation_raw;
      current.birth_date_raw = parsed.birth_date_raw;
      current.birth_date = parsed.birth_date;
      continue;
    }

    if (line.includes("কানা:")) {
      current.address_raw = line.slice(line.indexOf("কানা:") + "কানা:".length).trim();
      continue;
    }

    if (current.migrated && line.includes("মাইে")) {
      current.migration_status_raw = line;
      continue;
    }

    if (isHeaderOrFooterLine(line)) {
      continue;
    }

    if (current.address_raw) {
      current.address_raw = `${current.address_raw} ${line}`.trim();
    }
  }

  pushCurrent();
  return results;
}

async function extractText(pdfPath) {
  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text || "";
  } finally {
    if (typeof parser.destroy === "function") {
      await parser.destroy();
    }
  }
}

async function parsePdf(pdfPath) {
  const relativePath = path.relative(ROOT_DIR, pdfPath);
  const topFolder = relativePath.split(path.sep)[0];
  const fileMeta = parseFilename(path.basename(pdfPath));
  const text = await extractText(pdfPath);
  const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const header = extractHeaderMetadata(lines, fileMeta, relativePath, topFolder);
  const voters = parseVoterRecords(lines, header);

  return {
    header,
    voters,
    sourceFile: {
      _id: header.source_path,
      source_path: header.source_path,
      source_folder: header.source_folder,
      voter_area_code: header.voter_area_code,
      voter_area_name_raw: header.voter_area_name_raw,
      ward_no: header.ward_no,
      gender: header.gender,
      part_no: header.part_no,
      publish_date: header.publish_date,
      page_count: header.page_count,
      declared_total_voters: header.declared_total_voters,
      declared_category_voters: header.declared_category_voters,
      ocv_count: header.ocv_count,
      icpv_count: header.icpv_count,
      parsed_record_count: voters.length,
      count_match: voters.length === header.declared_category_voters,
    },
  };
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function loop() {
    while (true) {
      const currentIndex = index;
      index += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => loop());
  await Promise.all(workers);
  return results;
}

function groupByArea(sourceFiles) {
  const areaMap = new Map();

  for (const source of sourceFiles) {
    const key = `${source.source_folder}__${source.voter_area_code}`;
    if (!areaMap.has(key)) {
      areaMap.set(key, {
        _id: key,
        source_folder: source.source_folder,
        voter_area_code: source.voter_area_code,
        voter_area_name_raw: source.voter_area_name_raw,
        ward_no: source.ward_no,
        publish_date: source.publish_date,
        declared_total_voters: source.declared_total_voters,
        gender_counts: {
          male: 0,
          female: 0,
          hijra: 0,
        },
        file_count: 0,
        source_files: [],
      });
    }

    const area = areaMap.get(key);
    area.file_count += 1;
    area.source_files.push(source.source_path);
    area.gender_counts[source.gender] += source.declared_category_voters;

    if (!area.voter_area_name_raw && source.voter_area_name_raw) {
      area.voter_area_name_raw = source.voter_area_name_raw;
    }

    if (!area.ward_no && source.ward_no) {
      area.ward_no = source.ward_no;
    }

    if (!area.declared_total_voters && source.declared_total_voters) {
      area.declared_total_voters = source.declared_total_voters;
    }
  }

  return Array.from(areaMap.values()).sort((a, b) => a._id.localeCompare(b._id));
}

function buildSummary(voters, sourceFiles, areas) {
  const byFolder = new Map();
  const genderTotals = { male: 0, female: 0, hijra: 0 };
  const mismatches = [];

  for (const source of sourceFiles) {
    genderTotals[source.gender] += source.declared_category_voters;
    if (!source.count_match) {
      mismatches.push({
        source_path: source.source_path,
        declared_category_voters: source.declared_category_voters,
        parsed_record_count: source.parsed_record_count,
      });
    }

    if (!byFolder.has(source.source_folder)) {
      byFolder.set(source.source_folder, {
        source_folder: source.source_folder,
        files: 0,
        declared_voters: 0,
        male: 0,
        female: 0,
        hijra: 0,
      });
    }

    const row = byFolder.get(source.source_folder);
    row.files += 1;
    row.declared_voters += source.declared_category_voters;
    row[source.gender] += source.declared_category_voters;
  }

  const totalParsedVoters = voters.length;
  const totalDeclaredVoters = sourceFiles.reduce(
    (sum, source) => sum + source.declared_category_voters,
    0,
  );

  return {
    generated_at: new Date().toISOString(),
    total_pdf_files: sourceFiles.length,
    total_voter_records: totalParsedVoters,
    total_declared_voters_from_filenames: totalDeclaredVoters,
    total_area_documents: areas.length,
    total_source_folders: byFolder.size,
    gender_totals: genderTotals,
    count_mismatches: mismatches,
    per_folder_totals: Array.from(byFolder.values()).sort((a, b) =>
      a.source_folder.localeCompare(b.source_folder),
    ),
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function waitForStream(stream, eventName) {
  const result = await Promise.race([
    once(stream, eventName),
    once(stream, "error").then(([error]) => {
      throw error;
    }),
  ]);
  return result;
}

async function writeNdjson(filePath, rows) {
  const stream = fs.createWriteStream(filePath, { encoding: "utf8" });
  stream.setMaxListeners(0);

  for (const row of rows) {
    if (!stream.write(JSON.stringify(row))) {
      await waitForStream(stream, "drain");
    }
    if (!stream.write("\n")) {
      await waitForStream(stream, "drain");
    }
  }

  stream.end();
  await waitForStream(stream, "finish");
}

async function writeJsonArrayStream(filePath, rows) {
  const stream = fs.createWriteStream(filePath, { encoding: "utf8" });
  stream.setMaxListeners(0);

  if (!stream.write("[\n")) {
    await waitForStream(stream, "drain");
  }

  for (let index = 0; index < rows.length; index += 1) {
    const serialized = JSON.stringify(rows[index]);
    if (!stream.write(serialized)) {
      await waitForStream(stream, "drain");
    }
    if (!stream.write(index === rows.length - 1 ? "\n" : ",\n")) {
      await waitForStream(stream, "drain");
    }
  }

  stream.end("]\n");
  await waitForStream(stream, "finish");
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const pdfFiles = listPdfFiles(ROOT_DIR);

  console.log(`Found ${pdfFiles.length} PDF files. Starting extraction...`);

  const parsed = await runWithConcurrency(pdfFiles, CONCURRENCY, async (pdfPath, index) => {
    const result = await parsePdf(pdfPath);
    const current = index + 1;
    if (current % 10 === 0 || current === pdfFiles.length) {
      console.log(`Parsed ${current}/${pdfFiles.length}: ${path.relative(ROOT_DIR, pdfPath)}`);
    }
    return result;
  });

  const sourceFiles = parsed.map((entry) => entry.sourceFile);
  const voters = parsed.flatMap((entry) => entry.voters);
  const areas = groupByArea(sourceFiles);
  const summary = buildSummary(voters, sourceFiles, areas);

  await writeJsonArrayStream(path.join(OUTPUT_DIR, "voters.json"), voters);
  await writeNdjson(path.join(OUTPUT_DIR, "voters.ndjson"), voters);
  writeJson(path.join(OUTPUT_DIR, "areas.json"), areas);
  await writeNdjson(path.join(OUTPUT_DIR, "areas.ndjson"), areas);
  writeJson(path.join(OUTPUT_DIR, "source-files.json"), sourceFiles);
  await writeNdjson(path.join(OUTPUT_DIR, "source-files.ndjson"), sourceFiles);
  writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);

  console.log("Extraction complete.");
  console.log(`Total voter records: ${summary.total_voter_records}`);
  console.log(`Total declared voters: ${summary.total_declared_voters_from_filenames}`);
  console.log(`Count mismatches: ${summary.count_mismatches.length}`);
}

module.exports = {
  normalizeLine,
  parseFilename,
  parseVoterRecords,
  extractHeaderMetadata,
  parsePdf,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
