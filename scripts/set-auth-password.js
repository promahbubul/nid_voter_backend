const path = require("node:path");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/nid_voter";
const DEFAULT_USERNAME = String(process.env.AUTH_USERNAME || "admin").trim() || "admin";
const USERS_COLLECTION_NAME = "users";

function parseArgs(argv) {
  const parsed = {
    username: DEFAULT_USERNAME,
    password: "",
    displayName: "",
    role: "admin",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--username") {
      parsed.username = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (current === "--display-name") {
      parsed.displayName = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (current === "--role") {
      parsed.role = String(argv[index + 1] || "").trim() || "admin";
      index += 1;
      continue;
    }

    if (!parsed.password) {
      parsed.password = current;
    }
  }

  return parsed;
}

function normalizeUsernameKey(value) {
  return String(value || "").trim().toLowerCase();
}

async function ensureUsersIndexes(collection) {
  await collection.createIndexes([
    {
      key: { username_normalized: 1 },
      name: "username_normalized_unique",
      unique: true,
    },
    {
      key: { is_active: 1 },
      name: "is_active",
    },
  ]);
}

async function main() {
  const { username, password, displayName, role } = parseArgs(args);
  const normalizedUsername = String(username || "").trim();

  if (!password) {
    throw new Error('Password missing. Use: npm run auth:set-password -- "NewPassword123"');
  }

  if (!normalizedUsername) {
    throw new Error('Username missing. Use: npm run auth:set-password -- "NewPassword123" --username admin');
  }

  const hash = await bcrypt.hash(password, 12);
  const client = new MongoClient(MONGODB_URI);

  await client.connect();

  try {
    const db = client.db();
    const users = db.collection(USERS_COLLECTION_NAME);
    await ensureUsersIndexes(users);

    const now = new Date().toISOString();
    const resolvedDisplayName = displayName || (normalizedUsername === "admin" ? "System Administrator" : normalizedUsername);

    await users.updateOne(
      { username_normalized: normalizeUsernameKey(normalizedUsername) },
      {
        $set: {
          username: normalizedUsername,
          username_normalized: normalizeUsernameKey(normalizedUsername),
          password_hash: hash,
          display_name: resolvedDisplayName,
          role: role || "admin",
          is_active: true,
          updated_at: now,
        },
        $setOnInsert: {
          created_at: now,
        },
      },
      { upsert: true },
    );

    console.log(`Authentication user saved to MongoDB database: ${db.databaseName}`);
    console.log(`Username: ${normalizedUsername}`);
    console.log(`Role: ${role || "admin"}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
