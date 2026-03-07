const session = require('express-session');
const bcrypt = require('bcryptjs');

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'gws-default-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  },
});

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.authenticated) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/login');
    }
    const userRole = req.session.role || 'admin';
    if (roles.includes(userRole)) return next();
    // VA trying to access admin-only page → redirect to VA queue
    if (userRole === 'va') return res.redirect('/va');
    res.redirect('/dashboard');
  };
}

async function verifyLogin(email, password) {
  const adminEmail = (process.env.APP_LOGIN_EMAIL || '').toLowerCase();
  const adminHash = process.env.APP_PASSWORD_HASH || '';
  const vaEmail = (process.env.VA_LOGIN_EMAIL || '').toLowerCase();
  const vaHash = process.env.VA_PASSWORD_HASH || '';

  const inputEmail = email.toLowerCase();

  // Check admin credentials
  if (adminEmail && adminHash && inputEmail === adminEmail) {
    const match = await bcrypt.compare(password, adminHash);
    if (match) return 'admin';
  }

  // Check VA credentials
  if (vaEmail && vaHash && inputEmail === vaEmail) {
    const match = await bcrypt.compare(password, vaHash);
    if (match) return 'va';
  }

  return false;
}

module.exports = { sessionMiddleware, requireAuth, requireRole, verifyLogin };
