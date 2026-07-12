import { existsSync } from 'fs';
import { resolve } from 'path';
import { config as loadEnv } from 'dotenv';

for (const envPath of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(__dirname, '../../../.env'),
]) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath });
  }
}
