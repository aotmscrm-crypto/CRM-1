const express = require('express');
const router  = express.Router();
const { getStatus } = require('../utils/whatsappService');
const { getMetaCredentials, updateMetaCredentials, verifyMetaConnection, clearConfigCache } = require('../utils/metaConfigHelper');
const MessageLog = require('../models/MessageLog');

// ── GET current status ────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const creds = await getMetaCredentials();
    const testRes = await verifyMetaConnection(creds);
    res.json({
      status: testRes.reachable ? 'CONNECTED' : 'DISCONNECTED',
      reachable: testRes.reachable,
      wabaName: testRes.name || null,
      error: testRes.error || null,
      qr: null
    });
  } catch (err) {
    res.json({ status: 'DISCONNECTED', reachable: false, error: err.message, qr: null });
  }
});

// ── Connect / Disconnect ──────────────────────────────────────────────────────
router.post('/connect', (req, res) => {
  res.json({ success: true, message: 'Meta API uses static tokens. Configure credentials below.' });
});

router.post('/disconnect', (req, res) => {
  res.json({ success: true, message: 'Meta API disconnected.' });
});

router.get('/host-info', async (req, res) => {
  const creds = await getMetaCredentials();
  res.json({ success: true, phone: creds.phoneId, name: 'Meta WhatsApp App', id: creds.phoneId });
});

router.get('/config', async (req, res) => {
  try {
    const creds = await getMetaCredentials();
    const phoneId = creds.phoneId || '';
    const maskedPhone = phoneId.length > 4 ? `**********${phoneId.slice(-4)}` : phoneId;
    const token = creds.token || '';
    const maskedToken = token.length > 8 ? `${token.slice(0, 8)}...${token.slice(-6)}` : token;

    res.json({
      success: true,
      wabaId: creds.wabaId || '',
      phoneId: creds.phoneId || '',
      maskedPhone,
      maskedToken,
      hasToken: Boolean(creds.token),
      version: creds.version || 'v19.0',
      verifyToken: creds.verifyToken || 'zest_Eat'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Force flush MongoDB MetaConfig and re-sync with process.env
router.post('/sync-env', async (req, res) => {
  try {
    const MetaConfig = require('../models/MetaConfig');
    await MetaConfig.deleteMany({});
    clearConfigCache();
    const creds = await getMetaCredentials();
    res.json({
      success: true,
      message: 'MongoDB MetaConfig cleared and re-synced directly with backend .env!',
      config: creds
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/config', async (req, res) => {
  const { wabaId, phoneId, accessToken, verifyToken, graphVersion } = req.body;

  if (!wabaId || !phoneId || !accessToken) {
    return res.status(400).json({
      success: false,
      message: 'WABA ID, Phone Number ID, and Access Token are required.'
    });
  }

  try {
    const result = await updateMetaCredentials({
      wabaId,
      phoneId,
      accessToken,
      verifyToken,
      graphVersion
    });

    res.json({
      success: true,
      message: `Meta credentials verified & saved successfully for account: ${result.metaInfo.name}! 🎉`,
      config: result.config
    });
  } catch (err) {
    console.error('❌ Failed to update Meta Config:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Failed to verify and save Meta credentials'
    });
  }
});

// ── Webhooks ──────────────────────────────────────────────────────────────────

// Webhook Verification (Required by Meta)
router.get('/webhook', async (req, res) => {
  const creds = await getMetaCredentials();
  const verify_token = creds.verifyToken || process.env.META_WA_VERIFY_TOKEN || 'zest_eat_meta_verify_8f9q2a';

  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verify_token) {
      console.log('✅ WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// Receive incoming messages & status updates from Meta Webhook
router.post('/webhook', async (req, res) => {
  try {
    let body = req.body;

    if (body.object) {
      // 1. Process Incoming Customer Messages
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0] &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const valueObj = body.entry[0].changes[0].value;
        const msgObj = valueObj.messages[0];
        const contactObj = valueObj.contacts?.[0] || {};
        const phone = msgObj.from;
        const wamid = msgObj.id;
        const msgType = msgObj.type;
        let text = '';
        if (msgType === 'text') text = msgObj.text?.body || '';
        else if (msgType === 'button') text = msgObj.button?.text || msgObj.button?.payload || 'Button Clicked';
        else if (msgType === 'interactive') text = msgObj.interactive?.button_reply?.title || msgObj.interactive?.list_reply?.title || 'Interactive Reply';
        else text = `[${msgType.toUpperCase()} Message]`;

        const senderName = contactObj.profile?.name || 'Customer';
        console.log(`📩 [WEBHOOK INCOMING MESSAGE] From ${senderName} (${phone}): ${text}`);

        const creds = await getMetaCredentials();
        const incomingPhoneId = valueObj.metadata?.phone_number_id || creds.phoneId;
        const incomingWabaId = body.entry[0].id || creds.wabaId;

        let cleanP = String(phone).replace(/\D/g, '');
        if (cleanP.startsWith('91') && cleanP.length === 12) cleanP = cleanP.slice(2);

        try {
          await MessageLog.findOneAndUpdate(
            { wamid },
            { 
              $set: {
                wamid,
                phone: cleanP,
                direction: 'INCOMING',
                status: 'received',
                text,
                senderName,
                timestamp: new Date(parseInt(msgObj.timestamp) * 1000),
                phoneId: incomingPhoneId,
                wabaId: incomingWabaId
              }
            },
            { upsert: true, new: true }
          );

          // Auto-upsert Contact in MongoDB so incoming message senders appear in contacts list
          const Contact = require('../models/Contact');
          const updateObj = { lastStatus: 'received', updatedAt: new Date() };
          // Note: Bio Name is NOT added/overwritten as requested by user

          await Contact.findOneAndUpdate(
            { phone: cleanP },
            { 
              $set: updateObj,
              $setOnInsert: {
                phone: cleanP,
                identity: 'new',
                source: 'inbound_whatsapp'
              }
            },
            { upsert: true, new: true }
          );
        } catch (dbErr) {
          console.error('Failed to save incoming message or contact:', dbErr);
        }
      }
      
      // 2. Process Message Delivery & Read Statuses
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0] &&
        body.entry[0].changes[0].value.statuses &&
        body.entry[0].changes[0].value.statuses[0]
      ) {
        let statusObj = body.entry[0].changes[0].value.statuses[0];
        
        let wamid = statusObj.id;
        let phone = statusObj.recipient_id;
        let status = statusObj.status;
        let timestamp = new Date(parseInt(statusObj.timestamp) * 1000);
        let errorCode = null;
        let errorMessage = null;
        let pricing = statusObj.pricing || null;
        
        if (status === 'failed' && statusObj.errors && statusObj.errors.length > 0) {
          errorCode = statusObj.errors[0].code;
          errorMessage = statusObj.errors[0].title || statusObj.errors[0].message || 'Unknown error';
        }
        
        console.log(`📊 [WEBHOOK STATUS] ${phone} | ${status.toUpperCase()} | wamid: ${wamid}`);
        if (errorCode) console.error(`❌ Meta Error: [${errorCode}] ${errorMessage}`);
        
        const creds = await getMetaCredentials();
        const incomingPhoneId = body.entry[0].changes[0].value.metadata?.phone_number_id || creds.phoneId;
        const incomingWabaId = body.entry[0].id || creds.wabaId;

        let cleanStatusPhone = String(phone).replace(/\D/g, '');
        if (cleanStatusPhone.startsWith('91') && cleanStatusPhone.length === 12) cleanStatusPhone = cleanStatusPhone.slice(2);

        try {
          await MessageLog.findOneAndUpdate(
            { wamid },
            { 
              $set: {
                wamid,
                phone: cleanStatusPhone,
                status,
                timestamp,
                errorCode,
                errorMessage,
                pricing,
                phoneId: incomingPhoneId,
                wabaId: incomingWabaId
              },
              $setOnInsert: {
                direction: 'OUTGOING',
                text: 'WhatsApp Template Message',
                templateName: 'Meta Template'
              }
            },
            { upsert: true, new: true }
          );
        } catch (dbErr) {
          console.error('Failed to save status to MessageLog:', dbErr);
        }
      }

      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.sendStatus(500);
  }
});

// GET /api/whatsapp/messages - Retrieve chat logs for real-time live chat polling
router.get('/messages', async (req, res) => {
  try {
    const { phone } = req.query;
    if (phone) {
      let digits = String(phone).replace(/\D/g, '');
      let p10 = digits.slice(-10);
      let p12 = '91' + p10;
      const filter = { phone: { $in: [p10, p12, digits, `+${p12}`, `+91${p10}`] } };
      const logs = await MessageLog.find(filter).sort({ timestamp: 1 }).limit(500);
      return res.json({ success: true, count: logs.length, logs });
    }

    // Fetch the MOST RECENT 1000 messages across all contacts for unread counts & top activity sorting
    const logs = await MessageLog.find({}).sort({ timestamp: -1 }).limit(1000);
    const sortedLogs = logs.reverse(); // put into chronological order
    res.json({ success: true, count: sortedLogs.length, logs: sortedLogs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;