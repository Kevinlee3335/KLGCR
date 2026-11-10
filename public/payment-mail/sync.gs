/* KLGCR payment email importer. Gmail read-only. Install the accompanying manifest first. */
var PAYMENT_MAILBOX = 'klgresidenceenquiry@gmail.com';
var PAYMENT_MAIL_MAX_BYTES = 10 * 1024 * 1024;
var PAYMENT_MAIL_MAX_PARTS = 100;
var PAYMENT_MAIL_CURSOR = 'KLGCR_PAYMENT_MAIL_CURSOR';

function installPaymentMail() {
  checkPaymentMailbox_();
  syncPaymentMail();
  if (!ScriptApp.getProjectTriggers().some(function(trigger) { return trigger.getHandlerFunction() === 'syncPaymentMail'; })) {
    ScriptApp.newTrigger('syncPaymentMail').timeBased().everyMinutes(15).create();
  }
}

function checkPaymentMailbox_() {
  if (String(Gmail.Users.getProfile('me').emailAddress).toLowerCase() !== PAYMENT_MAILBOX) {
    throw new Error('Use ' + PAYMENT_MAILBOX + ' to install or run the payment importer.');
  }
}

function paymentMailConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var origin = properties.getProperty('KLGCR_PAYMENT_MAIL_ORIGIN') || '';
  var token = properties.getProperty('KLGCR_PAYMENT_MAIL_TOKEN') || '';
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin) || !/^[a-f0-9]{64}$/.test(token)) {
    throw new Error('Set KLGCR_PAYMENT_MAIL_ORIGIN and KLGCR_PAYMENT_MAIL_TOKEN in Script Properties.');
  }
  return {url: origin + '/api/payment-mail/ingest', token: token};
}

function paymentMailPost_(config, data) {
  data.mailbox = PAYMENT_MAILBOX;
  data.protocol = 1;
  var response = UrlFetchApp.fetch(config.url, {
    method: 'post', contentType: 'application/json', headers: {Authorization: 'Bearer ' + config.token},
    payload: JSON.stringify(data), muteHttpExceptions: true, followRedirects: false
  });
  var status = response.getResponseCode();
  if (status !== 200) throw new Error('Payment importer ' + data.op + ' HTTP ' + status + '. Mailbox position retained.');
  return JSON.parse(response.getContentText());
}

function syncPaymentMail() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  var config;
  try {
    checkPaymentMailbox_();
    config = paymentMailConfig_();
    var settings = paymentMailPost_(config, {op: 'config'});
    var senders = settings.senders.filter(function(email) { return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email); });
    var properties = PropertiesService.getScriptProperties();
    var cursor = JSON.parse(properties.getProperty(PAYMENT_MAIL_CURSOR) || '{}');
    var start = Math.floor(Date.parse(settings.enabledFrom) / 1000);
    if (!Number.isFinite(start)) throw new Error('Payment importer start time was invalid.');
    if (cursor.connection !== settings.connectionId) cursor = {connection: settings.connectionId, through: start};
    var now = Math.floor(Date.now() / 1000);
    var deadline = Date.now() + 210000;
    // Replay a small overlap for mail arriving while Gmail indexes a just-completed window.
    var senderSet = paymentMailHash_(Utilities.newBlob(senders.join('\n')).getBytes());
    if (cursor.senderSet !== senderSet || !cursor.end) {
      cursor.start = Math.max(start, (cursor.through || start) - 3600);
      cursor.end = now;
      cursor.senderSet = senderSet;
      cursor.senderIndex = 0;
      cursor.page = '';
      properties.setProperty(PAYMENT_MAIL_CURSOR, JSON.stringify(cursor));
    }
    while (cursor.senderIndex < senders.length && Date.now() < deadline) {
      if (!paymentMailPage_(config, senders, cursor, deadline, properties)) break;
      properties.setProperty(PAYMENT_MAIL_CURSOR, JSON.stringify(cursor));
    }
    if (cursor.senderIndex >= senders.length) {
      properties.setProperty(PAYMENT_MAIL_CURSOR, JSON.stringify({connection: cursor.connection, through: cursor.end}));
    }
    paymentMailPost_(config, {op: 'heartbeat', state: 'ok'});
  } catch (error) {
    if (config) {
      try { paymentMailPost_(config, {op: 'heartbeat', state: 'error'}); } catch (ignored) { /* Retain the original failure. */ }
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function paymentMailPage_(config, senders, cursor, deadline, properties) {
  var batch = senders.slice(cursor.senderIndex, cursor.senderIndex + 20);
  var query = 'after:' + (cursor.start - 1) + ' before:' + cursor.end
    + ' {' + batch.map(function(email) { return 'from:"' + email + '"'; }).join(' ') + '} -in:trash -in:spam -in:drafts';
  var options = {q: query, maxResults: 10};
  if (cursor.page) options.pageToken = cursor.page;
  var result;
  try {
    result = Gmail.Users.Messages.list('me', options);
  } catch (error) {
    // Replay from the start of this sender batch if Gmail expires the page token.
    if (cursor.page) {
      cursor.page = '';
      properties.setProperty(PAYMENT_MAIL_CURSOR, JSON.stringify(cursor));
    }
    throw new Error('Gmail could not list payment messages. Mailbox position retained.');
  }
  var messages = result.messages || [];
  for (var i = 0; i < messages.length; i++) {
    if (Date.now() > deadline || !paymentMailMessage_(config, messages[i].id, batch, deadline)) return false;
  }
  cursor.page = result.nextPageToken || '';
  if (!cursor.page) cursor.senderIndex += batch.length;
  return true;
}

function paymentMailMessage_(config, id, senders, deadline) {
  var message = Gmail.Users.Messages.get('me', id, {format: 'full'});
  var payload = message.payload || {};
  var from = paymentMailHeader_(payload, 'from');
  var address = (from.match(/<([^<>]+)>\s*$/) || [null, from])[1].trim().toLowerCase();
  if (senders.indexOf(address) < 0) return true;
  var text = [], files = [];
  function walk(part) {
    var body = part.body || {};
    var mime = String(part.mimeType || '').toLowerCase();
    var name = part.filename || '';
    var inline = /^inline(?:;|$)/i.test(paymentMailHeader_(part, 'content-disposition')) || Boolean(paymentMailHeader_(part, 'content-id'));
    if (mime === 'text/plain' && !name && body.data) text.push(Utilities.newBlob(paymentMailDecode_(body.data)).getDataAsString());
    if (mime === 'application/pdf' || mime.indexOf('image/') === 0 || /\.(pdf|png|jpe?g|webp|heic|heif|gif|tiff?|bmp)$/i.test(name)) {
      if (!(inline && Number(body.size) <= 30000 && /^(?:logo|signature|facebook|instagram|linkedin|twitter|whatsapp|icon|spacer|tracking)(?:[_. -]|\d|$)/i.test(name))) {
        files.push({partId: part.partId || '0', filename: (name.trim() || 'Attachment ' + (part.partId || '0')).slice(0, 300), mime: mime, body: body});
      }
    }
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  if (files.length > PAYMENT_MAIL_MAX_PARTS) {
    files = files.slice(0, PAYMENT_MAIL_MAX_PARTS - 1);
    files.push({partId: '9999999999', filename: 'Additional attachments', problem: 'part_limit'});
  }
  var registered = paymentMailPost_(config, {
    op: 'message', id: id, threadId: message.threadId || undefined, sender: from.slice(0, 600),
    subject: paymentMailHeader_(payload, 'subject').slice(0, 2000), body: (text.join('\n') || message.snippet || '').slice(0, 60000),
    receivedAt: new Date(Number(message.internalDate)).toISOString(), partIds: files.map(function(file) { return file.partId; })
  });
  if (registered.done || registered.skip) return true;
  var issues = [];
  var finished = registered.finishedPartIds || [];
  for (var i = 0; i < files.length; i++) {
    if (Date.now() > deadline) return false;
    if (finished.indexOf(files[i].partId) >= 0) continue;
    var problem = paymentMailFile_(config, id, files[i]);
    if (problem) issues.push({partId: files[i].partId, filename: files[i].filename, reason: problem});
  }
  paymentMailPost_(config, {op: 'finalize', id: id, issues: issues});
  return true;
}

function paymentMailFile_(config, id, file) {
  if (file.problem) return file.problem;
  var type = file.mime;
  if (type === 'image/jpg') type = 'image/jpeg';
  if (type === 'application/octet-stream') {
    if (/\.pdf$/i.test(file.filename)) type = 'application/pdf';
    else if (/\.jpe?g$/i.test(file.filename)) type = 'image/jpeg';
    else if (/\.png$/i.test(file.filename)) type = 'image/png';
  }
  if (['application/pdf', 'image/jpeg', 'image/png'].indexOf(type) < 0) return 'unsupported';
  if (Number(file.body.size) > PAYMENT_MAIL_MAX_BYTES) return 'oversize';
  var data = file.body.data;
  if (file.body.attachmentId) {
    var url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(id)
      + '/attachments/' + encodeURIComponent(file.body.attachmentId);
    var response = UrlFetchApp.fetch(url, {
      headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
      muteHttpExceptions: true, followRedirects: false
    });
    var status = response.getResponseCode();
    if (status === 404 || status === 410) return 'unavailable';
    if (status !== 200) throw new Error('Gmail attachment HTTP ' + status + '. Mailbox position retained.');
    data = JSON.parse(response.getContentText()).data;
  }
  if (!data) return 'empty';
  var bytes = paymentMailDecode_(data);
  if (!bytes.length) return 'empty';
  if (bytes.length > PAYMENT_MAIL_MAX_BYTES) return 'oversize';
  var metadata = {partId: file.partId, filename: file.filename, mimeType: type, hash: paymentMailHash_(bytes), size: bytes.length};
  var prepared = paymentMailPost_(config, {op: 'prepare', id: id, file: metadata});
  if (prepared.done) return '';
  if (prepared.uploadUrl) {
    if (!/^https:\/\//i.test(prepared.uploadUrl)) throw new Error('Unsafe payment attachment upload URL.');
    var upload = UrlFetchApp.fetch(prepared.uploadUrl, {
      method: 'put', contentType: type, headers: {'x-upsert': 'false', 'Cache-Control': 'max-age=0'},
      payload: bytes, muteHttpExceptions: true, followRedirects: false
    });
    var uploadStatus = upload.getResponseCode();
    // A retry or second installation can save the same immutable file first.
    if ((uploadStatus < 200 || uploadStatus >= 300) && uploadStatus !== 409 && uploadStatus !== 400) {
      throw new Error('Payment attachment upload HTTP ' + uploadStatus + '. Mailbox position retained.');
    }
  } else if (!prepared.needsComplete) {
    throw new Error('Payment attachment upload could not be prepared.');
  }
  var completed = paymentMailPost_(config, {op: 'complete', id: id, file: metadata});
  if (completed.invalidFile) return 'invalid';
  if (!completed.done) throw new Error('Payment attachment could not be saved.');
  return '';
}

function paymentMailHeader_(part, name) {
  return ((part.headers || []).find(function(header) { return header.name.toLowerCase() === name; }) || {}).value || '';
}

function paymentMailHash_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function(byte) {
    return ('0' + ((byte + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function paymentMailDecode_(data) {
  if (Array.isArray(data)) return data;
  var encoded = String(data).replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (encoded.length % 4) encoded += '=';
  return Utilities.base64Decode(encoded);
}
