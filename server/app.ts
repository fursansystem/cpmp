import { type Server } from "node:http";

import express, {
  type Express,
  type Request,
  Response,
  NextFunction,
} from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Pool } from "@neondatabase/serverless";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";

import { registerRoutes } from "./routes";
import { storage } from "./storage";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export const app = express();
export { passport };

// Trust proxy for production - increased trust for SSL headers
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', true);
}

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
  limit: '50mb'
}));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Session setup with PostgreSQL store for production persistence
const PgSession = connectPgSimple(session);
const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(session({
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
}));

// Passport setup
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const user = await storage.getUserByUsername(username);
    if (!user) {
      return done(null, false, { message: 'اسم المستخدم غير صحيح' });
    }
    if (!user.isActive) {
      return done(null, false, { message: 'الحساب معطل' });
    }
    
    // التحقق مما إذا كانت كلمة المرور في قاعدة البيانات مشفرة بصيغة bcrypt
    const isHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$');
    
    let isValid = false;
    if (isHashed) {
      isValid = await bcrypt.compare(password, user.password);
    } else if (process.env.NODE_ENV !== 'production') {
      // يُسمح بمقارنة النص العادي فقط في بيئة التطوير (development) للسهولة عند تغيير قاعدة البيانات
      isValid = password === user.password;
    }

    if (!isValid) {
      return done(null, false, { message: 'كلمة المرور غير صحيحة' });
    }
    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
) {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly run the final setup after setting up all the other routes so
  // the catch-all route doesn't interfere with the other routes
  await setup(app, server);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: process.platform !== "win32",
  }, () => {
    log(`serving on port ${port}`);
  });
}
