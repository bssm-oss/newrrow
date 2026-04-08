import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
dotenv.config({ path: path.join(rootDir, '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Fill it in .env before running the automation.`);
  }
  return value;
}

export const ENV = {
  rootDir,
  baseUrl: process.env.NEWRROW_BASE_URL ?? 'https://bssm.newrrow.com',
  dashboardPath: '/csr-platform/dashboard',
  email: required('NEWRROW_EMAIL'),
  password: required('NEWRROW_PASSWORD'),
  storageStatePath: process.env.NEWRROW_STORAGE_STATE_PATH ?? path.join(rootDir, '.auth', 'storageState.json'),
  artifactDir: process.env.NEWRROW_ARTIFACT_DIR ?? path.join(rootDir, 'artifacts')
};

export function ensureRuntimeDirectories(): void {
  fs.mkdirSync(path.dirname(ENV.storageStatePath), { recursive: true });
  fs.mkdirSync(path.join(ENV.artifactDir, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(ENV.artifactDir, 'logs'), { recursive: true });
}
