/**
 * Shared layout wrapper with nav bar for all admin pages.
 * @param {string} title - Page title
 * @param {string} bodyHtml - The page's main content HTML
 * @param {string} activePage - Which nav item to highlight: 'dashboard', 'engagements', 'messages', 'estimator'
 * @param {object} options - { customStyles, customScripts }
 * @returns {string} Complete HTML document
 */
function wrapInLayout(title, bodyHtml, activePage, options = {}) {
  const { customStyles = '', customScripts = '' } = options;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
    { id: 'engagements', label: 'Engagements', href: '/engagements' },
    { id: 'messages', label: 'Messages', href: '/messages' },
    { id: 'estimator', label: 'Estimator', href: '/estimator' },
  ];

  const navLinks = navItems.map(item => {
    const activeClass = item.id === activePage ? ' active' : '';
    return `<a href="${item.href}" class="nav-link${activeClass}">${item.label}</a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - GWS Hub</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#1a2332; color:#e0e6ed; font-family:Arial,Helvetica,sans-serif; }

    .app-nav { background:#0f1419; border-bottom:1px solid #2a3a4a; display:flex; align-items:center; justify-content:space-between; padding:0 24px; height:52px; position:sticky; top:0; z-index:1000; }
    .nav-brand { font-size:18px; font-weight:bold; color:#fff; letter-spacing:0.5px; }
    .nav-brand span { color:#00d4ff; }
    .nav-links { display:flex; align-items:center; gap:0; }
    .nav-link { color:#8899aa; text-decoration:none; font-size:14px; font-weight:600; padding:14px 18px; border-bottom:2px solid transparent; transition:color .2s, border-color .2s; }
    .nav-link:hover { color:#e0e6ed; }
    .nav-link.active { color:#00d4ff; border-bottom-color:#00d4ff; }
    .nav-logout { color:#5a6a7a; text-decoration:none; font-size:13px; padding:8px 14px; border:1px solid #2a3a4a; border-radius:6px; margin-left:12px; transition:color .2s, border-color .2s; }
    .nav-logout:hover { color:#ef5350; border-color:#ef5350; }

    .nav-hamburger { display:none; background:none; border:none; color:#8899aa; font-size:24px; cursor:pointer; padding:4px 8px; }

    .app-content { min-height:calc(100vh - 52px); }

    @media (max-width:768px) {
      .nav-hamburger { display:block; }
      .nav-links { display:none; position:absolute; top:52px; left:0; right:0; background:#0f1419; flex-direction:column; border-bottom:1px solid #2a3a4a; padding:8px 0; }
      .nav-links.open { display:flex; }
      .nav-link { padding:12px 24px; border-bottom:none; }
      .nav-link.active { background:#1a2332; }
      .nav-logout { margin:8px 24px; text-align:center; }
    }

    ${customStyles}
  </style>
</head>
<body>
  <nav class="app-nav">
    <div class="nav-brand"><span>GWS</span> Hub</div>
    <button class="nav-hamburger" onclick="document.querySelector('.nav-links').classList.toggle('open')">&#9776;</button>
    <div class="nav-links">
      ${navLinks}
      <a href="/logout" class="nav-logout">Logout</a>
    </div>
  </nav>
  <div class="app-content">
    ${bodyHtml}
  </div>
  ${customScripts}
</body>
</html>`;
}

module.exports = { wrapInLayout };
