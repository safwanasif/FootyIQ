import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

if (!process.env.E2E_DATABASE_URL) {
  throw new Error("Set E2E_DATABASE_URL to a dedicated test database, never your normal collection database.");
}
const python = process.env.ML_PYTHON ?? (process.platform === "win32"
  ? path.join(process.cwd(), "services/ml/venv/Scripts/python.exe") : "python");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3003", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: `"${python}" -m uvicorn app:app --host 127.0.0.1 --port 5002`, cwd: "services/ml", url: "http://localhost:5002/health", reuseExistingServer: false },
    { command: "npm run start --workspace services/api", url: "http://localhost:3002/health", reuseExistingServer: false,
      env: { DATABASE_URL: process.env.E2E_DATABASE_URL, ML_SERVICE_URL: "http://localhost:5002", WEB_ORIGIN: "http://localhost:3003", PORT: "3002", COOKIE_SECURE: "false" } },
    { command: "npm run start --workspace apps/web -- --port 3003", url: "http://localhost:3003", reuseExistingServer: false },
  ],
});
