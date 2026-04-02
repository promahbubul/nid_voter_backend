const { MongoClient } = require("mongodb");
const env = require("./env");

let client;
let db;

async function connectToDatabase() {
  if (db) return db;

  client = new MongoClient(env.mongoUri);
  await client.connect();
  db = client.db();
  return db;
}

function getDb() {
  if (!db) {
    throw new Error("Database is not connected yet.");
  }
  return db;
}

module.exports = {
  connectToDatabase,
  getDb,
};
