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
  res.redirect('/login');
}

async function verifyLogin(email, password) {
  const validEmail = (process.env.APP_LOGIN_EMAIL || '').toLowerCase();
  const passwordHash = process.env.APP_PASSWORD_HASH || '';

  if (!validEmail || !passwordHash) return false;
  if (email.toLowerCase() !== validEmail) return false;

  return bcrypt.compare(password, passwordHash);
}

module.exports = { sessionMiddleware, requireAuth, verifyLogin };
