import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "@neondatabase/serverless";

// Session setup with PostgreSQL store for production persistence.
// Lives in its own module so the WebSocket server can read the same session cookie.
const PgSession = connectPgSimple(session);
const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  proxy: true, // Enable proxy support for cookies
  store: new PgSession({
    pool: sessionPool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    // Default is every 15 minutes, which wakes the serverless database around the clock even
    // with nobody using the app. Sessions live 24 hours, so pruning once a day is enough.
    pruneSessionInterval: 60 * 60 * 24,
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
});
