const { MongoClient } = require("mongodb");
const env = require("./env");

let client;
let db;
let connectPromise;
let lastConnectionAttemptAt = null;
let lastConnectionError = null;

function createDatabaseUnavailableError() {
  const error = new Error("Database is unavailable. Check MongoDB connectivity and MONGODB_URI.");
  error.statusCode = 503;

  if (lastConnectionError) {
    error.details = lastConnectionError.message;
  }

  return error;
}

async function connectToDatabase() {
  if (db) return db;
  if (connectPromise) return connectPromise;

  lastConnectionAttemptAt = new Date().toISOString();
  const nextClient = new MongoClient(env.mongoUri, {
    serverSelectionTimeoutMS: env.mongoServerSelectionTimeoutMs,
  });

  connectPromise = nextClient
    .connect()
    .then(() => {
      client = nextClient;
      db = client.db();
      lastConnectionError = null;
      return db;
    })
    .catch((error) => {
      lastConnectionError = error;
      throw error;
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
}

function getDb() {
  if (!db) {
    throw createDatabaseUnavailableError();
  }
  return db;
}

function getDbStatus() {
  return {
    connected: Boolean(db),
    connecting: Boolean(connectPromise),
    databaseName: db?.databaseName || null,
    lastConnectionAttemptAt,
    lastConnectionError: lastConnectionError
      ? {
          name: lastConnectionError.name,
          message: lastConnectionError.message,
          code: lastConnectionError.code || null,
        }
      : null,
  };
}

module.exports = {
  connectToDatabase,
  createDatabaseUnavailableError,
  getDb,
  getDbStatus,
};
