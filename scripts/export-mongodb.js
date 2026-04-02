const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");
const { EJSON } = require("bson");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const ROOT_DIR = path.resolve(__dirname, "../..");
const EXPORT_ROOT = path.join(ROOT_DIR, "exports");
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nid_voter";
const LARGE_COLLECTION_THRESHOLD = 5000;

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function timestampPart(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
}

async function exportAsNdjson(collection, targetPath) {
  const stream = fs.createWriteStream(targetPath, { encoding: "utf8" });
  const cursor = collection.find({});
  let count = 0;

  try {
    for await (const doc of cursor) {
      stream.write(`${EJSON.stringify(doc, { relaxed: true })}\n`);
      count += 1;
      if (count % 50000 === 0) {
        console.log(`Exported ${collection.collectionName}: ${count}`);
      }
    }
  } finally {
    await cursor.close();
    await new Promise((resolve, reject) => {
      stream.end((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  return count;
}

async function exportAsJson(collection, targetPath) {
  const docs = await collection.find({}).toArray();
  fs.writeFileSync(targetPath, EJSON.stringify(docs, { relaxed: true, space: 2 }));
  return docs.length;
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  try {
    const db = client.db();
    const startedAt = new Date();
    const exportDir = path.join(EXPORT_ROOT, `${slugify(db.databaseName)}-export-${timestampPart(startedAt)}`);
    ensureDirectory(exportDir);

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const manifest = {
      database: db.databaseName,
      exported_at: startedAt.toISOString(),
      source_uri: MONGODB_URI,
      collections: [],
    };

    console.log(`Connected to MongoDB: ${db.databaseName}`);
    console.log(`Export directory: ${exportDir}`);

    for (const { name } of collections) {
      const collection = db.collection(name);
      const documentCount = await collection.countDocuments();
      const indexes = await collection.indexes();
      const baseName = slugify(name);
      const format = documentCount > LARGE_COLLECTION_THRESHOLD ? "ndjson" : "json";
      const fileName = `${baseName}.${format === "ndjson" ? "ndjson" : "json"}`;
      const targetPath = path.join(exportDir, fileName);

      console.log(`Exporting ${name} (${documentCount} docs) -> ${fileName}`);
      const exportedCount =
        format === "ndjson"
          ? await exportAsNdjson(collection, targetPath)
          : await exportAsJson(collection, targetPath);

      fs.writeFileSync(
        path.join(exportDir, `${baseName}.indexes.json`),
        EJSON.stringify(indexes, { relaxed: true, space: 2 }),
      );

      manifest.collections.push({
        name,
        documents: exportedCount,
        format,
        data_file: fileName,
        indexes_file: `${baseName}.indexes.json`,
      });
    }

    const importHint = {
      note: "For MongoDB, use mongoimport for data files and recreate indexes from the exported *.indexes.json files.",
      examples: manifest.collections.map((collectionInfo) => ({
        collection: collectionInfo.name,
        command:
          collectionInfo.format === "ndjson"
            ? `mongoimport --db <target_db> --collection ${collectionInfo.name} --file ${collectionInfo.data_file}`
            : `mongoimport --db <target_db> --collection ${collectionInfo.name} --jsonArray --file ${collectionInfo.data_file}`,
      })),
    };

    fs.writeFileSync(
      path.join(exportDir, "manifest.json"),
      EJSON.stringify(manifest, { relaxed: true, space: 2 }),
    );
    fs.writeFileSync(
      path.join(exportDir, "import-hints.json"),
      EJSON.stringify(importHint, { relaxed: true, space: 2 }),
    );

    console.log("Export complete.");
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
