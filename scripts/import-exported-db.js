const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");
const { EJSON } = require("bson");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const ROOT_DIR = path.resolve(__dirname, "../..");
const EXPORT_ROOT = path.join(ROOT_DIR, "exports");
const SOURCE_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nid_voter";
const IMPORT_DB_NAME = String(process.env.IMPORT_DB_NAME || "").trim();
const IMPORT_EXPORT_DIR = String(process.env.IMPORT_EXPORT_DIR || "").trim();
const NDJSON_BATCH_SIZE = 2000;

function ensureExportDir() {
  if (IMPORT_EXPORT_DIR) {
    return path.isAbsolute(IMPORT_EXPORT_DIR)
      ? IMPORT_EXPORT_DIR
      : path.resolve(ROOT_DIR, IMPORT_EXPORT_DIR);
  }

  if (!fs.existsSync(EXPORT_ROOT)) {
    throw new Error(`Export root not found: ${EXPORT_ROOT}`);
  }

  const candidates = fs
    .readdirSync(EXPORT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(EXPORT_ROOT, entry.name),
      modifiedAt: fs.statSync(path.join(EXPORT_ROOT, entry.name)).mtimeMs,
    }))
    .sort((a, b) => b.modifiedAt - a.modifiedAt);

  if (!candidates.length) {
    throw new Error(`No export directories found in: ${EXPORT_ROOT}`);
  }

  return candidates[0].fullPath;
}

function sanitizeIndexDefinition(indexDefinition) {
  const { key, name, v, ns, ...options } = indexDefinition;
  return {
    key,
    name,
    ...options,
  };
}

async function resetCollection(db, collectionName) {
  const existing = await db.listCollections({ name: collectionName }).toArray();
  if (existing.length > 0) {
    await db.collection(collectionName).drop();
  }
}

async function importJsonArray(collection, filePath) {
  const docs = EJSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(docs)) {
    throw new Error(`Expected JSON array in: ${filePath}`);
  }

  if (!docs.length) {
    return 0;
  }

  await collection.insertMany(docs, { ordered: false });
  return docs.length;
}

async function importNdjson(collection, filePath) {
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
    console.log(`Imported ${collection.collectionName}: ${imported}`);
    batch = [];
  }

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    batch.push(EJSON.parse(trimmed));
    if (batch.length >= NDJSON_BATCH_SIZE) {
      await flushBatch();
    }
  }

  await flushBatch();
  return imported;
}

async function recreateIndexes(collection, indexesFilePath) {
  if (!fs.existsSync(indexesFilePath)) {
    return;
  }

  const rawIndexes = EJSON.parse(fs.readFileSync(indexesFilePath, "utf8"));
  const indexSpecs = rawIndexes
    .filter((index) => index.name !== "_id_")
    .map(sanitizeIndexDefinition);

  if (indexSpecs.length) {
    await collection.createIndexes(indexSpecs);
  }
}

async function main() {
  if (!IMPORT_DB_NAME) {
    throw new Error("IMPORT_DB_NAME is missing. Add it to backend/.env before running this script.");
  }

  const exportDir = ensureExportDir();
  const manifestPath = path.join(exportDir, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in export directory: ${exportDir}`);
  }

  const manifest = EJSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const client = new MongoClient(SOURCE_URI);
  await client.connect();

  try {
    const db = client.db(IMPORT_DB_NAME);
    console.log(`Connected to MongoDB server using: ${SOURCE_URI}`);
    console.log(`Target database: ${db.databaseName}`);
    console.log(`Import source: ${exportDir}`);

    for (const collectionInfo of manifest.collections) {
      const collection = db.collection(collectionInfo.name);
      const dataPath = path.join(exportDir, collectionInfo.data_file);
      const indexesPath = path.join(exportDir, collectionInfo.indexes_file);

      await resetCollection(db, collectionInfo.name);
      console.log(`Importing ${collectionInfo.name} from ${collectionInfo.data_file}`);

      const count =
        collectionInfo.format === "ndjson"
          ? await importNdjson(collection, dataPath)
          : await importJsonArray(collection, dataPath);

      await recreateIndexes(collection, indexesPath);
      console.log(`Imported ${collectionInfo.name}: ${count}`);
    }

    console.log("Import completed successfully.");
    console.log(
      JSON.stringify(
        {
          database: db.databaseName,
          import_source: exportDir,
          collections: manifest.collections.map((item) => ({
            name: item.name,
            documents: item.documents,
          })),
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
