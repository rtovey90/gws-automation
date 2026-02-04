const { verifyLogin } = require('../middleware/auth');

exports.showLogin = (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/dashboard');
  }

  const error = req.query.error === '1' ? 'Invalid email or password' : '';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login - GWS Hub</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#1a2332; color:#e0e6ed; font-family:Arial,Helvetica,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .login-box { background:#0f1419; border:1px solid #2a3a4a; border-radius:12px; padding:40px; width:100%; max-width:400px; margin:20px; }
    .login-box h1 { text-align:center; font-size:24px; color:#fff; margin-bottom:8px; }
    .login-box .subtitle { text-align:center; font-size:13px; color:#8899aa; margin-bottom:32px; }
    .form-group { margin-bottom:20px; }
    .form-group label { display:block; font-size:13px; color:#8899aa; margin-bottom:6px; text-transform:uppercase; letter-spacing:1px; }
    .form-group input { width:100%; padding:12px 14px; background:#1a2332; border:1px solid #2a3a4a; border-radius:6px; color:#e0e6ed; font-size:15px; outline:none; transition:border-color .2s; }
    .form-group input:focus { border-color:#00d4ff; }
    .login-btn { width:100%; padding:12px; background:#00d4ff; color:#0f1419; border:none; border-radius:6px; font-size:15px; font-weight:bold; cursor:pointer; transition:background .2s; }
    .login-btn:hover { background:#00b8d9; }
    .error { background:#2a1a1a; border:1px solid #ef5350; color:#ef5350; border-radius:6px; padding:10px 14px; font-size:13px; margin-bottom:20px; text-align:center; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>GWS Hub</h1>
    <p class="subtitle">Great White Security</p>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/login">
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" required autofocus placeholder="you@example.com">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" name="password" required placeholder="Enter password">
      </div>
      <button type="submit" class="login-btn">Sign In</button>
    </form>
  </div>
</body>
</html>`);
};

exports.handleLogin = async (req, res) => {
  const { email, password } = req.body;

  const valid = await verifyLogin(email || '', password || '');
  if (valid) {
    req.session.authenticated = true;
    return res.redirect('/dashboard');
  }

  res.redirect('/login?error=1');
};

exports.handleLogout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
};
