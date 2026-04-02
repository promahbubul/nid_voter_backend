const app = require("./app");
const { connectToDatabase } = require("./config/db");
const env = require("./config/env");

async function bootstrap() {
  const db = await connectToDatabase();
  app.listen(env.port, () => {
    console.log(`Backend running at http://localhost:${env.port}`);
    console.log(`MongoDB database: ${db.databaseName}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
