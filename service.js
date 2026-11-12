var http = require('http');
var https = require('https');
var urlModule = require('url');
var zlib = require('zlib');
var crypto = require('crypto');

var PORT = 8123;
var serverStarted = false;
var cookieJar = {}; // domain -> { name: value }

function storeCookies(hostname, setCookieHeader) {
  if (!setCookieHeader) return;
  var list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  var baseDomain = hostname.replace(/^www\./, '');
  if (hostname.indexOf('google.') !== -1) baseDomain = 'google';
  if (!cookieJar[baseDomain]) cookieJar[baseDomain] = {};
  for (var i = 0; i < list.length; i++) {
    var raw = String(list[i] || '').split(';')[0].trim();
    var eqIdx = raw.indexOf('=');
    if (eqIdx > 0) {
      var k = raw.substring(0, eqIdx).trim();
      var v = raw.substring(eqIdx + 1).trim();
      cookieJar[baseDomain][k] = v;
    }
  }
}

function getCookieHeader(hostname) {
  var baseDomain = hostname.replace(/^www\./, '');
  if (hostname.indexOf('google.') !== -1) baseDomain = 'google';
  var jar = cookieJar[baseDomain];
  if (!jar) return '';
  var pairs = [];
  var keys = Object.keys(jar);
  for (var i = 0; i < keys.length; i++) {
    pairs.push(keys[i] + '=' + jar[keys[i]]);
  }
  return pairs.join('; ');
}

function decodeVoePayload(rawStr) {
  try {
    var s = String(rawStr || '').replace(/[a-zA-Z]/g, function(c) {
      var base = c <= 'Z' ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
    s = s.replace(/(@\$|\^\^|~@|%\?|\*~|!!|#&)/g, '');
    var step1 = Buffer.from(s, 'base64').toString('utf8');
    var shifted = '';
    for (var i = 0; i < step1.length; i++) {
      shifted += String.fromCharCode(step1.charCodeAt(i) - 3);
    }
    var rev = shifted.split('').reverse().join('');
    var jsonStr = Buffer.from(rev, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

function fetchTarget(targetUrl, opts, depth, callback) {
  if (depth > 8) {
    return callback(null, { status: 508, finalUrl: targetUrl, html: 'Too many redirects' });
  }
  var parsed;
  try {
    parsed = urlModule.parse(targetUrl);
  } catch (e) {
    return callback(e);
  }
  if (!parsed || !parsed.hostname) {
    return callback(new Error('Invalid URL: ' + targetUrl));
  }

  var isHttps = parsed.protocol === 'https:';
  var mod = isHttps ? https : http;
  var isGoogle = parsed.hostname.indexOf('google.') !== -1 || parsed.hostname.indexOf('gstatic.') !== -1;

  var ua = isGoogle
    ? 'Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (S60; SymbOS; Opera Mobi/23.348; U; de) Presto/2.5.25 Version/10.54'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  var headers = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate'
  };

  if (opts && opts.referer) {
    headers['Referer'] = opts.referer;
  }

  var cookieStr = getCookieHeader(parsed.hostname);
  if (cookieStr) {
    headers['Cookie'] = cookieStr;
  }

  if (opts.method === 'POST' && opts.body) {
    headers['Content-Type'] = opts.contentType || 'application/x-www-form-urlencoded';
    headers['Content-Length'] = Buffer.byteLength(opts.body, 'utf8');
  }

  var reqOpts = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.path || '/',
    method: opts.method || 'GET',
    headers: headers,
    rejectUnauthorized: false
  };

  var req = mod.request(reqOpts, function(res) {
    storeCookies(parsed.hostname, res.headers['set-cookie']);

    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      var nextUrl = urlModule.resolve(targetUrl, res.headers.location);
      res.resume();
      return fetchTarget(nextUrl, { method: 'GET', referer: targetUrl, keepScripts: opts.keepScripts }, depth + 1, callback);
    }

    var chunks = [];
    var stream = res;
    var enc = String(res.headers['content-encoding'] || '').toLowerCase();
    if (enc === 'gzip') {
      stream = res.pipe(zlib.createGunzip());
    } else if (enc === 'deflate') {
      stream = res.pipe(zlib.createInflate());
    }

    stream.on('data', function(chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', function() {
      var bodyStr = Buffer.concat(chunks).toString('utf8');
      if (isGoogle && !opts.keepScripts) {
        bodyStr = bodyStr
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
      }
      callback(null, {
        status: res.statusCode || 200,
        finalUrl: targetUrl,
        html: bodyStr
      });
    });
    stream.on('error', function(err) {
      callback(err);
    });
  });

  req.setTimeout(8000, function() {
    req.abort();
    callback(new Error('Timeout'));
  });

  req.on('error', function(err) {
    if (isHttps && !opts._retriedHttp) {
      var httpUrl = targetUrl.replace(/^https:\/\//i, 'http://');
      var nextOpts = { method: opts.method, body: opts.body, contentType: opts.contentType, referer: opts.referer, _retriedHttp: true };
      return fetchTarget(httpUrl, nextOpts, depth, callback);
    }
    callback(err);
  });

  if (opts.method === 'POST' && opts.body) {
    req.write(opts.body);
  }
  req.end();
}

function solveAltcha(challengeObj) {
  try {
    var algorithm = challengeObj.algorithm || 'SHA-256';
    var challenge = challengeObj.challenge;
    var max = challengeObj.maxnumber || 100000;
    var salt = challengeObj.salt;
    var signature = challengeObj.signature;
    for (var n = 0; n <= max; n++) {
      var h = crypto.createHash('sha256').update(salt + String(n)).digest('hex');
      if (h === challenge) {
        return Buffer.from(JSON.stringify({
          algorithm: algorithm,
          challenge: challenge,
          number: n,
          salt: salt,
          signature: signature,
          took: 12
        })).toString('base64');
      }
    }
  } catch (e) {}
  return null;
}

function bypassRedirectGate(gateUrl, refererUrl, tokenT, callback) {
  var parsedGate = urlModule.parse(gateUrl);
  var origin = parsedGate.protocol + '//' + parsedGate.host;
  var pageToFetch = (refererUrl && refererUrl.indexOf(parsedGate.hostname) !== -1) ? refererUrl : (origin + '/');

  fetchTarget(pageToFetch, { method: 'GET', referer: origin + '/', keepScripts: true }, 0, function(err, epRes) {
    if (err || !epRes || !epRes.html) return callback(err || new Error('Failed to load episode page for gate'));
    var csrfMatch = epRes.html.match(/name=["']_token["']\s+value=["']([^"']+)["']/i) ||
                    epRes.html.match(/name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
    var csrf = csrfMatch ? csrfMatch[1] : '';
    fetchTarget(origin + '/api/inline/verify-init', { method: 'GET', referer: pageToFetch, keepScripts: true }, 0, function(err2, chalRes) {
      if (err2 || !chalRes || !chalRes.html) return callback(err2 || new Error('Failed verify-init'));
      var chalObj = null;
      try { chalObj = JSON.parse(chalRes.html); } catch (e) {}
      var altcha = chalObj ? solveAltcha(chalObj) : '';
      if (!altcha) return callback(new Error('Could not solve ALTCHA'));
      var postBody = '_token=' + encodeURIComponent(csrf) + '&t=' + encodeURIComponent(tokenT) + '&altcha=' + encodeURIComponent(altcha);
      fetchTarget(origin + '/r', {
        method: 'POST',
        referer: pageToFetch,
        contentType: 'application/x-www-form-urlencoded',
        body: postBody,
        keepScripts: true
      }, 0, callback);
    });
  });
}

function extractVideoFromUrl(startUrl, refererUrl, depth, callback) {
  if (depth > 6) {
    return callback(new Error('Too many embed hops'));
  }
  fetchTarget(startUrl, { method: 'GET', referer: refererUrl || 'http://186.2.175.5/', keepScripts: true }, 0, function(err, res) {
    if (err || !res || !res.html) {
      return callback(err || new Error('Empty response'));
    }

    function processEmbedHtml(html, currentUrl) {
      // Automatically bypass 186.2.175.5 frameBridge / ALTCHA redirect gate
      if (html.indexOf('frameBridge') !== -1 && !res._gateBypassed) {
        res._gateBypassed = true;
        var tMatch = html.match(/var\s+t\s*=\s*["']([^"']+)["']/i);
        var parsedStart = urlModule.parse(startUrl, true);
        var tokenT = (tMatch && tMatch[1]) || (parsedStart.query && parsedStart.query.t) || '';
        if (tokenT) {
          return bypassRedirectGate(startUrl, refererUrl, tokenT, function(gErr, gRes) {
            if (gErr || !gRes || !gRes.html) {
              return callback(gErr || new Error('Gate bypass failed'));
            }
            processEmbedHtml(gRes.html, gRes.finalUrl || startUrl);
          });
        }
      }

      // 1. Check VOE obfuscated application/json payload
      var voeJsonMatch = html.match(/<script\s+type=["']application\/json["']>\s*\[\s*["']([^"']+)["']\s*\]\s*<\/script>/i);
      if (voeJsonMatch && voeJsonMatch[1]) {
        var decoded = decodeVoePayload(voeJsonMatch[1]);
        if (decoded && (decoded.source || decoded.direct_access_url)) {
          return callback(null, {
            ok: true,
            streamUrl: decoded.source || decoded.direct_access_url,
            mp4Url: decoded.direct_access_url || '',
            title: decoded.title || '',
            thumbnail: decoded.thumbnail || '',
            embedUrl: currentUrl
          });
        }
      }

      // 2. Check plain or base64 'hls': '...' in VOE / generic players
      var hlsMatch = html.match(/['"]hls['"]\s*:\s*['"]([^'"]+)['"]/i);
      if (hlsMatch && hlsMatch[1]) {
        var hlsVal = hlsMatch[1];
        if (hlsVal.indexOf('http') !== 0) {
          try { hlsVal = Buffer.from(hlsVal, 'base64').toString('utf8'); } catch (e) {}
        }
        if (hlsVal.indexOf('http') === 0) {
          return callback(null, {
            ok: true,
            streamUrl: hlsVal,
            mp4Url: '',
            title: '',
            embedUrl: currentUrl
          });
        }
      }

      // 3. Check direct .m3u8 or .mp4 URL in HTML
      var m3u8Match = html.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i) ||
                      html.match(/https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/i);
      if (m3u8Match && m3u8Match[0]) {
        return callback(null, {
          ok: true,
          streamUrl: m3u8Match[0],
          mp4Url: '',
          title: '',
          embedUrl: currentUrl
        });
      }

      // 4. Check JS or meta-refresh redirect (e.g. voe.sx -> susanexpectcare.com)
      var jsRedirect = html.match(/window\.location\.(?:href|replace)\s*(?:=|\()\s*['"](https?:\/\/[^'"]+)['"]/i) ||
                       html.match(/meta[^>]+http-equiv=["']refresh["'][^>]+url=['"]?(https?:\/\/[^'">\s]+)/i);
      if (jsRedirect && jsRedirect[1]) {
        var nextHop = urlModule.resolve(currentUrl, jsRedirect[1]);
        return extractVideoFromUrl(nextHop, currentUrl, depth + 1, callback);
      }

      return callback(new Error('No direct video stream found at ' + currentUrl));
    }

    processEmbedHtml(res.html, res.finalUrl || startUrl);
  });
}

function startLocalServer() {
  if (serverStarted) return;
  serverStarted = true;

  var srv = http.createServer(function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    var parsedReq = urlModule.parse(req.url, true);
    if (parsedReq.pathname === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: '1.1.5', gateBypass: true }));
      return;
    }

    if (parsedReq.pathname === '/shutdown') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      setTimeout(function() { process.exit(0); }, 50);
      return;
    }

    if (parsedReq.pathname === '/extract-video') {
      var playUrl = parsedReq.query && parsedReq.query.url;
      var refUrl = (parsedReq.query && parsedReq.query.referer) || 'http://186.2.175.5/';
      if (!playUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing url parameter' }));
        return;
      }
      extractVideoFromUrl(playUrl, refUrl, 0, function(err, info) {
        if (err || !info) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err ? err.message : 'Extract failed' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(info));
      });
      return;
    }

    if (parsedReq.pathname === '/proxy') {
      var targetUrl = parsedReq.query && parsedReq.query.url;
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing url parameter' }));
        return;
      }

      var bodyChunks = [];
      req.on('data', function(c) { bodyChunks.push(c); });
      req.on('end', function() {
        var reqBody = Buffer.concat(bodyChunks).toString('utf8');
        var fetchMethod = req.method === 'POST' ? 'POST' : 'GET';
        fetchTarget(targetUrl, {
          method: fetchMethod,
          body: reqBody,
          contentType: req.headers['content-type']
        }, 0, function(err, result) {
          if (err || !result) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err ? err.message : 'Fetch error' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            ok: true,
            status: result.status,
            finalUrl: result.finalUrl,
            html: result.html
          }));
        });
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  srv.on('error', function() {});
  srv.listen(8124, '127.0.0.1');

  var srvLegacy = http.createServer(srv.listeners('request')[0]);
  srvLegacy.on('error', function() {});
  srvLegacy.listen(PORT, '127.0.0.1');
}

startLocalServer();

module.exports = {
  onStart: function onStart() {
    startLocalServer();
  },
  onRequest: function onRequest() {
    startLocalServer();
  },
  onStop: function onStop() {}
};
