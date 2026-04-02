const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const ROOT_DIR = path.resolve(__dirname, "../..");
const RAW_OUTPUT_DIR = path.join(ROOT_DIR, "output");
const NORMALIZED_OUTPUT_DIR = path.join(ROOT_DIR, "output-normalized");
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nid_voter";
const VOTER_BATCH_SIZE = 2000;

function resolveOutputDir() {
  if (process.env.DATA_DIR) {
    return path.isAbsolute(process.env.DATA_DIR)
      ? process.env.DATA_DIR
      : path.resolve(ROOT_DIR, process.env.DATA_DIR);
  }

  if (fs.existsSync(path.join(NORMALIZED_OUTPUT_DIR, "voters.ndjson"))) {
    return NORMALIZED_OUTPUT_DIR;
  }

  return RAW_OUTPUT_DIR;
}

const OUTPUT_DIR = resolveOutputDir();

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, fileName), "utf8"));
}

async function resetCollection(db, collectionName) {
  const existing = await db.listCollections({ name: collectionName }).toArray();
  if (existing.length > 0) {
    await db.collection(collectionName).drop();
  }
}

async function importSmallCollection(db, collectionName, fileName) {
  const docs = readJson(fileName);
  const collection = db.collection(collectionName);

  if (Array.isArray(docs)) {
    if (docs.length) {
      await collection.insertMany(docs, { ordered: false });
    }
    return docs.length;
  }

  if (docs && typeof docs === "object") {
    await collection.insertOne(docs);
    return 1;
  }

  return 0;
}

async function importVoters(db, fileName) {
  const collection = db.collection("voters");
  const filePath = path.join(OUTPUT_DIR, fileName);
  const reader = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let batch = [];
  let imported = 0;

  async function flushBatch() {
    if (!batch.length) return;
    await collection.insertMany(batch, { ordered: false });
    imported += batch.length;
    console.log(`Imported voters: ${imported}`);
    batch = [];
  }

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    batch.push(JSON.parse(trimmed));
    if (batch.length >= VOTER_BATCH_SIZE) {
      await flushBatch();
    }
  }

  await flushBatch();
  return imported;
}

async function createIndexes(db) {
  await db.collection("users").createIndexes([
    { key: { username_normalized: 1 }, name: "username_normalized_unique", unique: true },
    { key: { is_active: 1 }, name: "is_active" },
  ]);

  await db.collection("voters").createIndexes([
    { key: { source_folder: 1, voter_area_code: 1, gender: 1 }, name: "folder_area_gender" },
    { key: { ward_no: 1, gender: 1 }, name: "ward_gender" },
    {
      key: { voter_no: 1 },
      name: "voter_no_lookup",
    },
    { key: { record_status: 1, special_tag: 1 }, name: "status_special" },
    { key: { birth_year: 1 }, name: "birth_year" },
    { key: { source_path: 1, serial: 1 }, name: "source_serial" },
    { key: { name_raw: 1 }, name: "name_raw" },
    { key: { father_name_raw: 1 }, name: "father_name_raw" },
    { key: { mother_name_raw: 1 }, name: "mother_name_raw" },
    { key: { district_raw: 1 }, name: "district_raw" },
    { key: { upazila_raw: 1 }, name: "upazila_raw" },
    { key: { district_raw: 1, upazila_raw: 1 }, name: "district_upazila" },
    { key: { voter_area_name_raw: 1 }, name: "voter_area_name_raw" },
    { key: { occupation_raw: 1 }, name: "occupation_raw" },
  ]);

  await db.collection("areas").createIndexes([
    { key: { source_folder: 1, voter_area_code: 1 }, name: "folder_area" },
    { key: { ward_no: 1 }, name: "ward_no" },
  ]);

  await db.collection("source_files").createIndexes([
    { key: { source_folder: 1, voter_area_code: 1, gender: 1 }, name: "folder_area_gender" },
    { key: { source_path: 1 }, name: "source_path_unique", unique: true },
  ]);
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  try {
    const db = client.db();
    console.log(`Connected to MongoDB: ${db.databaseName}`);
    console.log(`Importing data from: ${OUTPUT_DIR}`);

    await resetCollection(db, "voters");
    await resetCollection(db, "areas");
    await resetCollection(db, "source_files");
    await resetCollection(db, "summary");

    const areaCount = await importSmallCollection(db, "areas", "areas.json");
    const sourceFileCount = await importSmallCollection(db, "source_files", "source-files.json");

    const summaryDoc = readJson("summary.json");
    summaryDoc._id = "latest";
    summaryDoc.mongodb_uri = MONGODB_URI;
    summaryDoc.imported_at = new Date().toISOString();
    await db.collection("summary").insertOne(summaryDoc);

    const voterCount = await importVoters(db, "voters.ndjson");
    await createIndexes(db);

    console.log("Import complete.");
    console.log(
      JSON.stringify(
        {
          database: db.databaseName,
          voters: voterCount,
          areas: areaCount,
          source_files: sourceFileCount,
          summary: 1,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
