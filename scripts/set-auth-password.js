const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");

const ENV_PATH = path.resolve(__dirname, "../.env");
const args = process.argv.slice(2);

function parseArgs(argv) {
  const parsed = {
    password: "",
    envPath: ENV_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--file") {
      parsed.envPath = path.resolve(process.cwd(), argv[index + 1] || "");
      index += 1;
      continue;
    }

    if (!parsed.password) {
      parsed.password = current;
    }
  }

  return parsed;
}

function updateEnvValue(content, key, value) {
  const normalizedValue = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, normalizedValue);
  }

  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const suffix = content.endsWith(newline) || !content ? "" : newline;
  return `${content}${suffix}${normalizedValue}${newline}`;
}

async function main() {
  const { password, envPath } = parseArgs(args);

  if (!password) {
    throw new Error('Password missing. Use: npm run auth:set-password -- "NewPassword123"');
  }

  if (!fs.existsSync(envPath)) {
    throw new Error(`.env file not found: ${envPath}`);
  }

  const envContent = fs.readFileSync(envPath, "utf8");
  const hash = await bcrypt.hash(password, 12);
  const updatedContent = updateEnvValue(envContent, "AUTH_PASSWORD_HASH", hash);

  fs.writeFileSync(envPath, updatedContent);

  console.log(`Password hash updated in: ${envPath}`);
  console.log("Restart the backend server after changing the password.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
