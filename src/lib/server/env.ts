// Central env access. Loading dotenv here means the same modules work both
// inside the SvelteKit server and in the standalone worker process (run via
// tsx), which has no knowledge of SvelteKit's `$env`. Real process env always
// wins over .env (dotenv does not override existing vars), which is what we
// want in production.
import "dotenv/config"

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  OSU_CLIENT_ID: required("OSU_CLIENT_ID"),
  OSU_CLIENT_SECRET: required("OSU_CLIENT_SECRET"),
  OSU_AUTH_CALLBACK_URL: required("OSU_AUTH_CALLBACK_URL"),
}
