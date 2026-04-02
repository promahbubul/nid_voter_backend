const app = require("./app");
const { connectToDatabase } = require("./config/db");
const env = require("./config/env");

async function bootstrap() {
  app.listen(env.port, () => {
    console.log(`Backend running at http://localhost:${env.port}`);
  });

  try {
    const db = await connectToDatabase();
    console.log(`MongoDB database: ${db.databaseName}`);
  } catch (error) {
    console.error("MongoDB connection failed. Backend is running with database-backed routes unavailable.");
    console.error(error.message);
  }
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
