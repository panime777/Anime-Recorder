export function getDatabaseUrl() {
  const netlifyDatabaseUrl = process.env.NETLIFY_DB_URL;

  if (netlifyDatabaseUrl) {
    const url = new URL(netlifyDatabaseUrl);

    // Netlify's local database URL omits the username, which pg requires.
    if (url.hostname === "localhost" && !url.username) {
      url.username = "postgres";
    }

    return url.toString();
  }

  return process.env.DATABASE_URL;
}
