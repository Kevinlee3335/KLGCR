/* KLGCR supplier archive. Gmail read-only. No send/delete/label operations.
 * Add Script Properties: KLGCR_ARCHIVE_TOKEN and KLGCR_ARCHIVE_ORIGIN.
 * Install appsscript.json from the accompanying manifest before running install().
 */
var ARCHIVE_ACCOUNT = 'klgresidenceenquiry@gmail.com';
var ARCHIVE_START = Math.floor(new Date('2023-01-01T00:00:00+08:00').getTime()/1000);
var ARCHIVE_SENDERS = ['sigmamy.com','mfetsb@gmail.com'];
function install() {
  var profile = Gmail.Users.getProfile('me');
  if (profile.emailAddress.toLowerCase() !== ARCHIVE_ACCOUNT) throw new Error('Use '+ARCHIVE_ACCOUNT+' to install this script.');
  archiveConfig_();
  // Run once first. Authorization or connectivity errors must surface before scheduling.
  syncSupplierMail();
  if (!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='syncSupplierMail';})) {
    ScriptApp.newTrigger('syncSupplierMail').timeBased().everyMinutes(15).create();
  }
}
function archiveConfig_() {
  var p=PropertiesService.getScriptProperties();
  var origin=p.getProperty('KLGCR_ARCHIVE_ORIGIN');
  var token=p.getProperty('KLGCR_ARCHIVE_TOKEN');
  if (!/^https:\/\/klgcr-maintenance-system(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin || '') || !/^[a-f0-9]{64}$/.test(token || '')) throw new Error('Set KLGCR_ARCHIVE_ORIGIN and KLGCR_ARCHIVE_TOKEN in Script Properties.');
  return {url:origin+'/api/supplier-mail/ingest',token:token};
}
function archivePost_(data) {
  var config=archiveConfig_();
  var response=UrlFetchApp.fetch(config.url,{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+config.token},payload:JSON.stringify(data),muteHttpExceptions:true,followRedirects:false});
  if (response.getResponseCode()!==200) throw new Error('Archive HTTP '+response.getResponseCode()+'. Cursor retained; check KLGCR configuration.');
  return JSON.parse(response.getContentText());
}
function syncSupplierMail() {
  var lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    if (Gmail.Users.getProfile('me').emailAddress.toLowerCase()!==ARCHIVE_ACCOUNT) throw new Error('Incorrect Gmail account.');
    var properties=PropertiesService.getScriptProperties(),now=Math.floor(Date.now()/1000),deadline=Date.now()+230000;
    if (!properties.getProperty('BACKFILL_END')) properties.setProperty('BACKFILL_END',String(now));
    // Keep new mail flowing while the historical import runs over multiple executions.
    if (!properties.getProperty('LIVE_END')) {
      properties.setProperty('LIVE_START',String(Math.max(ARCHIVE_START,Number(properties.getProperty('LIVE_THROUGH') || now-86400)-86400)));
      properties.setProperty('LIVE_END',String(now));
    }
    archivePage_('LIVE',Number(properties.getProperty('LIVE_START')),Number(properties.getProperty('LIVE_END')),deadline);
    while (Date.now()<deadline && properties.getProperty('BACKFILL_DONE')!=='true') archivePage_('BACKFILL',ARCHIVE_START,Number(properties.getProperty('BACKFILL_END')),deadline);
  } finally {lock.releaseLock();}
}
function archivePage_(kind,start,end,deadline) {
  var props=PropertiesService.getScriptProperties();
  var query='after:'+(start-1)+' before:'+end+' {from:'+ARCHIVE_SENDERS.join(' from:')+'} -in:trash -in:spam';
  var options={q:query,maxResults:10},page=props.getProperty(kind+'_PAGE');
  if(page) options.pageToken=page;
  var result;
  try {result=Gmail.Users.Messages.list('me',options);} catch(error) {
    // A failed/expired page token is replayed from the first page; server-side deduplication is safe.
    if(page) props.deleteProperty(kind+'_PAGE');
    throw error;
  }
  var messages=result.messages || [];
  for(var n=0;n<messages.length;n++) {
    if(Date.now()>deadline) return; // Replay the current page next time if interrupted.
    archiveMessage_(messages[n].id);
  }
  if(result.nextPageToken) props.setProperty(kind+'_PAGE',result.nextPageToken);
  else {
    props.deleteProperty(kind+'_PAGE');
    if(kind==='BACKFILL') props.setProperty('BACKFILL_DONE','true');
    else {props.setProperty('LIVE_THROUGH',String(end));props.deleteProperty('LIVE_END');props.deleteProperty('LIVE_START');}
  }
  console.log(kind+': processed '+messages.length+' messages. More pages: '+Boolean(result.nextPageToken));
}
function archiveMessage_(id) {
  var message=Gmail.Users.Messages.get('me',id,{format:'full'}),payload=message.payload || {};
  var headers=payload.headers || [];
  function header(name) {return (headers.find(function(h){return h.name.toLowerCase()===name;}) || {}).value || '';}
  var sender=header('from'),match=sender.match(/<([^<>]+)>\s*$/),address=(match?match[1]:sender.trim()).toLowerCase();
  if((!(/^[^@\s<>]+@sigmamy\.com$/.test(address)) && address!=='mfetsb@gmail.com') || Number(message.internalDate)<ARCHIVE_START*1000) return;
  var text=[],files=[];
  function walk(part) {
    var body=part.body || {};
    if(part.mimeType==='text/plain' && !part.filename && body.data) text.push(Utilities.newBlob(decodeGmailData_(body.data)).getDataAsString());
    if(part.filename && /\.pdf$/i.test(part.filename)) files.push(part);
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  archivePost_({op:'message',mailbox:ARCHIVE_ACCOUNT,id:id,sender:sender,subject:header('subject').slice(0,2000),body:(text.join('\n') || message.snippet || '').slice(0,60000),receivedAt:new Date(Number(message.internalDate)).toISOString()});
  files.forEach(function(part){
    var filename=part.filename.slice(0,255),partId=part.partId || '0',body=part.body || {};
    if(body.size>52428800) {archivePost_({op:'issue',id:id,partId:partId,filename:filename,issue:'PDF exceeds 50 MB. Open the original email to download.'});return;}
    var data=body.data;
    if(!data && body.attachmentId) data=Gmail.Users.Messages.Attachments.get('me',id,body.attachmentId).data;
    if(!data) throw new Error('PDF attachment content is missing; cursor retained.');
    var bytes=decodeGmailData_(data);
    if(!bytes.length || Utilities.newBlob(bytes.slice(0,1024)).getDataAsString().indexOf('%PDF-')<0) {archivePost_({op:'issue',id:id,partId:partId,filename:filename,issue:'Attachment is not a valid PDF. Open the original email to check.'});return;}
    var hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
    var file={partId:partId,filename:filename,hash:hash,size:bytes.length};
    var prepared=archivePost_({op:'prepare',id:id,file:file});
    if(prepared.done) return;
    if(prepared.uploadUrl) {
      var upload=UrlFetchApp.fetch(prepared.uploadUrl,{method:'put',contentType:'application/pdf',payload:bytes,muteHttpExceptions:true,followRedirects:false});
      if(upload.getResponseCode()<200 || upload.getResponseCode()>=300) throw new Error('PDF upload failed; cursor retained.');
    }
    archivePost_({op:'complete',id:id,file:file});
  });
}

function decodeGmailData_(data) {
  if (Array.isArray(data)) return data;
  var encoded = String(data).replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (encoded.length % 4) encoded += '=';
  return Utilities.base64Decode(encoded);
}
