const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const Template = require('../models/Template');
const Contact  = require('../models/Contact');
const { getClient, initWhatsApp, getStatus } = require('../utils/whatsappService');
const { ConversationFlow } = require('../utils/conversationFlow');
const { createTemplateOnMeta, getTemplateStatusFromMeta, uploadMediaToMeta, fetchAllTemplatesFromMeta } = require('../utils/metaTemplateService');
const { uploadToCloudinary, uploadUrlToCloudinary } = require('../utils/cloudinaryService');
const { getMetaCredentials } = require('../utils/metaConfigHelper');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads/campaigns/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

const fs  = require('fs');
const dir = path.join(__dirname, '../uploads/campaigns/');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const sendDelay = (base = 4000) => {
  const jitter = Math.floor(Math.random() * 2000) - 1000;
  return sleep(Math.max(2500, base + jitter));
};
// ── Meta Broadcast runner ─────────────────────────────────────────────────────
const runMetaBroadcast = async (template, phoneList) => {
  let sent = 0, failed = 0;
  console.log(`🚀 Bulk Meta send to ${phoneList.length} contacts...`);

  // Meta Cloud API is stateless and doesn't need socket connection waiting!
  for (let i = 0; i < phoneList.length; i++) {
    const rawPhone = phoneList[i];
    let cleanP = String(rawPhone).replace(/\D/g, '');
    if (cleanP.startsWith('91') && cleanP.length === 12) cleanP = cleanP.slice(2);

    try {
      const sendRes = await ConversationFlow.startMetaTemplate(rawPhone, template);
      const wamid = sendRes?.messages?.[0]?.id || `tmpl_${Date.now()}_${i}`;

      const MessageLog = require('../models/MessageLog');
      const bodyComp = Array.isArray(template.components) ? template.components.find(c => (c.type || '').toUpperCase() === 'BODY') : null;
      const headerComp = Array.isArray(template.components) ? template.components.find(c => (c.type || '').toUpperCase() === 'HEADER') : null;

      let tmplText = template.body_text || bodyComp?.text || template.message || template.title || (template.name ? `Template: ${template.name}` : 'Meta Template Message');
      let tmplHeaderImg = template.imageUrl || template.header_image_url || (headerComp?.example?.header_handle?.[0] || '');

      let parsedButtons = [];
      try {
        parsedButtons = typeof template.buttons === 'string' ? JSON.parse(template.buttons) : (template.buttons || []);
      } catch (bErr) {
        parsedButtons = [];
      }

      if ((!parsedButtons || parsedButtons.length === 0) && Array.isArray(template.components)) {
        const btnComp = template.components.find(c => (c.type || '').toUpperCase() === 'BUTTONS');
        if (btnComp && Array.isArray(btnComp.buttons)) {
          parsedButtons = btnComp.buttons;
        }
      }

      await MessageLog.findOneAndUpdate(
        { wamid },
        {
          $set: {
            wamid,
            phone: cleanP,
            direction: 'OUTGOING',
            status: 'sent',
            text: tmplText,
            templateName: template.name || 'Meta Template',
            headerImageUrl: tmplHeaderImg,
            buttons: parsedButtons,
            timestamp: new Date(),
            phoneId: process.env.META_WA_PHONE_NUMBER_ID,
            wabaId: process.env.META_WA_BUSINESS_ACCOUNT_ID
          }
        },
        { upsert: true, new: true }
      );

      await Contact.findOneAndUpdate({ phone: cleanP }, { $inc: { templatesSent: 1 }, lastStatus: 'sent' }, { upsert: true });
      sent++;
      console.log(`✅ [${i + 1}/${phoneList.length}] Sent Meta Template '${template.name}' to ${cleanP} (wamid: ${wamid})`);
    } catch (e) {
      failed++;
      console.error(`❌ [${i + 1}/${phoneList.length}] Failed ${phone}:`, e.message);
    }
    // Meta allows higher limits, so delay can be smaller than Baileys
    if (i < phoneList.length - 1) await sendDelay(500); 
  }

  template.totalSent   = (template.totalSent || 0) + sent;
  template.totalFailed = (template.totalFailed || 0) + failed;
  template.status      = sent > 0 ? 'completed' : 'failed';
  template.lastRunAt   = new Date();
  await template.save();
  console.log(`🏁 Meta Broadcast Done: ${sent} sent, ${failed} failed`);
};

// Legacy Baileys endpoint /api/template/send removed.

// POST /api/template/send-meta
// Send an approved Meta Template to users
router.post('/send-meta', async (req, res) => {
  const { templateId, phones } = req.body;
  if (!templateId) return res.status(400).json({ success: false, message: 'Template ID required' });

  const template = await Template.findById(templateId);
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found' });
  }
  
  if (!template.metaTemplateId) {
    return res.status(400).json({ success: false, message: 'This template does not have a valid Meta Template ID attached.' });
  }

  // Strict Validation: Fetch from Meta to ensure it's still approved right before sending
  try {
    const metaData = await getTemplateStatusFromMeta(template.metaTemplateId);
    if (!metaData || metaData.status !== 'APPROVED') {
       return res.status(400).json({ success: false, message: `Template is not APPROVED on Meta. Current status: ${metaData?.status || 'UNKNOWN'}` });
    }
    // Update local status just in case
    if (template.metaStatus !== 'APPROVED') {
      template.metaStatus = 'APPROVED';
      await template.save();
    }
  } catch (e) {
    return res.status(400).json({ success: false, message: 'Invalid Meta Template ID or template is no longer accessible.' });
  }

  let phoneList = [];
  try { 
    const parsed = JSON.parse(phones || '[]'); 
    if (Array.isArray(parsed)) phoneList = parsed;
    else phoneList = String(phones || '').split(',').map(p => p.trim()).filter(Boolean);
  }
  catch { phoneList = String(phones || '').split(',').map(p => p.trim()).filter(Boolean); }

  if (!phoneList.length) {
    const contacts = await Contact.find({ optedOut: false });
    phoneList = contacts.map(c => c.phone);
  }
  if (!phoneList.length) return res.status(400).json({ success: false, message: 'No contacts to send to' });

  res.json({ success: true, total: phoneList.length, message: 'Meta Broadcast started!' });
  runMetaBroadcast(template, phoneList);
});

// POST /api/template/schedule
router.post('/schedule', upload.single('image'), async (req, res) => {
  const { title, message, footer, phones, scheduleTime, repeatDaily, scheduleDays } = req.body;
  if (!scheduleTime) return res.status(400).json({ success: false, message: 'scheduleTime required (HH:MM)' });

  let phoneList = [];
  try { 
    const parsed = JSON.parse(phones || '[]'); 
    if (Array.isArray(parsed)) phoneList = parsed;
    else phoneList = String(phones || '').split(',').map(p => p.trim()).filter(Boolean);
  }
  catch { phoneList = String(phones || '').split(',').map(p => p.trim()).filter(Boolean); }

  if (!phoneList.length) {
    const contacts = await Contact.find({ optedOut: false });
    phoneList = contacts.map(c => c.phone);
  }

  const [hh, mm] = scheduleTime.split(':').map(Number);
  const next = new Date();
  next.setHours(hh, mm, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);

  let cloudinaryUrl = '';
  if (req.file) {
    try {
      cloudinaryUrl = await uploadToCloudinary(req.file.path, 'zest_eat_schedules');
    } catch (e) {
      console.error('Cloudinary schedule upload failed:', e.message);
    }
  }

  const template = new Template({
    title: title || 'Fresh Stock Available!', message, footer: footer || '',
    imageUrl: cloudinaryUrl || (req.file ? `/uploads/campaigns/${req.file.filename}` : ''),
    contacts: phoneList, status: 'scheduled',
    isScheduled: true, scheduleTime,
    repeatDaily: repeatDaily === 'true' || repeatDaily === true,
    scheduleDays: scheduleDays ? JSON.parse(scheduleDays) : [],
    nextRunAt: next, isActive: true,
  });
  await template.save();
  res.json({ success: true, template, message: `Scheduled for ${scheduleTime}` });
});

router.get('/schedules', async (req, res) => {
  const schedules = await Template.find({ isScheduled: true }).sort('-createdAt');
  res.json({ success: true, schedules });
});

router.put('/schedule/:id/toggle', async (req, res) => {
  const t = await Template.findById(req.params.id);
  if (!t) return res.status(404).json({ success: false, message: 'Not found' });
  t.isActive = !t.isActive;
  await t.save();
  res.json({ success: true, template: t });
});

router.delete('/schedule/:id', async (req, res) => {
  await Template.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  try {
    await Template.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Template deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/template/:id
// Update an existing template (Utility/Marketing) with image/text/components
router.put('/:id', upload.single('media'), async (req, res) => {
  try {
    const templateId = req.params.id;
    let template = await Template.findOne({
      $or: [{ _id: templateId.match(/^[0-9a-fA-F]{24}$/) ? templateId : null }, { metaTemplateId: templateId }]
    });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    let { name, language, category, components, header_image_url, message, body_text, footer_text, header_text } = req.body;
    if (typeof components === 'string') {
      try { components = JSON.parse(components); } catch (e) {}
    }

    if (name) template.name = name;
    if (category) template.category = category;
    if (language) template.language = language;
    if (message || body_text) template.message = body_text || message;
    if (footer_text) template.footer = footer_text;
    if (Array.isArray(components)) template.components = components;

    if (req.file) {
      let cloudinaryUrl = null;
      try {
        cloudinaryUrl = await uploadToCloudinary(req.file.path, 'zest_eat_templates');
      } catch (err) {
        console.error('Cloudinary template upload failed:', err.message);
      }
      template.imageUrl = cloudinaryUrl || `/uploads/campaigns/${req.file.filename}`;
    } else if (header_image_url) {
      template.imageUrl = header_image_url;
    }

    await template.save();
    res.json({ success: true, template, message: 'Template updated successfully' });
  } catch (err) {
    console.error('Update template error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});


router.get('/', async (req, res) => {
  const creds = await getMetaCredentials();
  const currentWaba = creds.wabaId;
  const filter = { isScheduled: { $ne: true } };
  if (currentWaba) {
    filter.wabaId = currentWaba;
  }
  const templates = await Template.find(filter).sort('-createdAt');
  res.json({ success: true, templates, currentWabaId: currentWaba });
});

// POST /api/template/meta
// Create a new template directly on Meta WhatsApp Cloud API
router.post('/meta', upload.single('media'), async (req, res) => {
  let { name, language, category, components } = req.body;
  const creds = await getMetaCredentials();
  
  if (typeof components === 'string') {
    components = JSON.parse(components);
  }
  
  if (!name || !language || !category || !components) {
    return res.status(400).json({ success: false, message: 'Missing required Meta template fields' });
  }

  try {
    // 1. Media handling & component sanitization
    let cloudinaryUrl = null;
    if (req.file) {
      try {
        cloudinaryUrl = await uploadToCloudinary(req.file.path, 'zest_eat_templates');
      } catch (err) {
        console.error('Cloudinary template upload failed:', err.message);
      }

      const handle = await uploadMediaToMeta(req.file.path, req.file.mimetype, req.file.size);
      
      let headerIndex = components.findIndex(c => c.type === 'HEADER');
      if (headerIndex !== -1) {
        components[headerIndex].format = 'IMAGE';
        components[headerIndex].example = { header_handle: [handle] };
      } else {
        components.unshift({
          type: 'HEADER',
          format: 'IMAGE',
          example: { header_handle: [handle] }
        });
      }
    } else {
      // Remove any HEADER component claiming IMAGE format without an image example handle
      components = components.filter(c => !(c.type === 'HEADER' && c.format === 'IMAGE' && (!c.example || !c.example.header_handle)));
    }

    const metaResponse = await createTemplateOnMeta(name, language, category, components);
    
    // 2b. Upload media again but specifically for sending (to get a media_id instead of a handle)
    let mediaId = null;
    if (req.file) {
      const { uploadMediaForSending } = require('../utils/metaTemplateService');
      try {
        mediaId = await uploadMediaForSending(req.file.path, req.file.mimetype);
      } catch (err) {
        console.error('Failed to upload media for sending:', err.message);
      }
    }
    
    // 3. Save in database
    const template = new Template({
      name,
      language,
      category,
      components,
      imageUrl: cloudinaryUrl || (req.file ? `/uploads/${req.file.filename}` : ''),
      mediaId, // Save the Meta media ID for sending
      metaTemplateId: metaResponse.id,
      metaStatus: metaResponse.status || 'PENDING',
      wabaId: creds.wabaId || '',
      title: name, // fallback display
      message: Array.isArray(components) ? (components.find(c => c.type === 'BODY')?.text || 'Meta Template') : 'Meta Template',
      status: 'draft'
    });
    
    await template.save();
    
    res.json({ success: true, template, message: 'Template submitted to Meta successfully!' });
  } catch (error) {
    const errorMsg = error.metaError?.message || error.message || 'Failed to create template on Meta';
    console.error('Meta Template API Error:', errorMsg);
    return res.status(400).json({ 
      success: false, 
      message: `Meta API Error: ${errorMsg}` 
    });
  }
});


// POST /api/template/import-meta
// Import a template from Meta by its ID
router.post('/import-meta', async (req, res) => {
  const { metaTemplateId, imageUrl } = req.body;
  
  if (!metaTemplateId) {
    return res.status(400).json({ success: false, message: 'Meta Template ID is required' });
  }

  try {
    const metaData = await getTemplateStatusFromMeta(metaTemplateId);
    if (!metaData || !metaData.name) {
      return res.status(404).json({ success: false, message: 'Template not found on Meta' });
    }

    // Check if it already exists
    let template = await Template.findOne({ metaTemplateId });
    if (template) {
      return res.status(400).json({ success: false, message: 'Template already exists in database' });
    }

    template = new Template({
      name: metaData.name,
      language: metaData.language,
      category: metaData.category,
      components: metaData.components || [],
      metaTemplateId: metaData.id,
      metaStatus: metaData.status || 'PENDING',
      imageUrl: imageUrl || '', // Save user provided imageUrl if applicable
      title: metaData.name,
      message: 'Imported Meta Template',
      status: 'draft'
    });

    await template.save();

    res.json({ success: true, template, message: 'Template imported successfully' });
  } catch (error) {
    console.error('Import Meta Template Error:', error);
    res.status(500).json({ success: false, message: error.response?.data?.error?.message || error.message || 'Failed to import template' });
  }
});

// POST /api/template/sync-meta AND /api/template/sync
// Synchronize all templates directly from Meta Cloud API into the database
const syncMetaTemplatesHandler = async (req, res) => {
  try {
    const creds = await getMetaCredentials();
    const currentWaba = creds.wabaId;
    if (!currentWaba || !creds.token) {
      return res.status(400).json({
        success: false,
        message: 'Meta credentials missing. Please configure your WABA Account ID & Token in Settings.'
      });
    }

    const metaTemplates = await fetchAllTemplatesFromMeta();
    let syncedCount = 0;
    const activeMetaIds = metaTemplates.map(t => t.id);

    for (const mt of metaTemplates) {
      const existing = await Template.findOne({
        $or: [{ metaTemplateId: mt.id }, { name: mt.name }]
      });

      const bodyComp = mt.components?.find(c => c.type === 'BODY');
      const footerComp = mt.components?.find(c => c.type === 'FOOTER');
      const headerComp = mt.components?.find(c => c.type === 'HEADER');

      if (existing) {
        // Deduplicate: remove any other records with this name or ID
        await Template.deleteMany({
          _id: { $ne: existing._id },
          $or: [{ metaTemplateId: mt.id }, { name: mt.name }]
        });

        existing.name = mt.name;
        existing.metaTemplateId = mt.id;
        existing.metaStatus = mt.status || existing.metaStatus;
        existing.components = mt.components || existing.components;
        existing.language = mt.language || existing.language;
        existing.category = mt.category || existing.category;
        existing.wabaId = currentWaba;
        if (bodyComp?.text) existing.message = bodyComp.text;
        if (footerComp?.text) existing.footer = footerComp.text;

        // Auto-host to Cloudinary if not already on Cloudinary
        const handleUrl = headerComp?.example?.header_handle?.[0];
        if (!existing.imageUrl || !existing.imageUrl.includes('cloudinary.com')) {
          if (handleUrl && handleUrl.startsWith('http')) {
            try {
              const cloudUrl = await uploadUrlToCloudinary(handleUrl, 'zest_eat_templates');
              if (cloudUrl) existing.imageUrl = cloudUrl;
            } catch (e) {}
          }
        }

        await existing.save();
        syncedCount++;
      } else {
        let initialImage = '';
        const handleUrl = headerComp?.example?.header_handle?.[0];
        if (handleUrl && handleUrl.startsWith('http')) {
          try {
            initialImage = await uploadUrlToCloudinary(handleUrl, 'zest_eat_templates') || handleUrl;
          } catch (e) {
            initialImage = handleUrl;
          }
        }

        const created = await Template.create({
          name: mt.name,
          language: mt.language,
          category: mt.category,
          components: mt.components || [],
          metaTemplateId: mt.id,
          metaStatus: mt.status || 'APPROVED',
          wabaId: currentWaba,
          title: mt.name,
          message: bodyComp?.text || mt.name,
          footer: footerComp?.text || '',
          imageUrl: initialImage,
          status: 'draft'
        });

        await Template.deleteMany({
          _id: { $ne: created._id },
          $or: [{ metaTemplateId: mt.id }, { name: mt.name }]
        });
        syncedCount++;
      }
    }

    // Clean up outdated templates belonging to other WABA accounts or deleted Meta IDs
    if (currentWaba && activeMetaIds.length > 0) {
      await Template.deleteMany({
        metaTemplateId: { $exists: true, $ne: null, $nin: activeMetaIds },
        metaStatus: { $nin: ['PENDING', 'IN_REVIEW'] },
        isScheduled: { $ne: true }
      });
    }

    const filter = { isScheduled: { $ne: true } };
    if (currentWaba) {
      filter.wabaId = currentWaba;
    }
    const all = await Template.find(filter).sort('-createdAt');
    res.json({ 
      success: true, 
      count: syncedCount, 
      templates: all, 
      currentWabaId: currentWaba, 
      message: `Successfully synced ${all.length} templates for Meta Account (${currentWaba})!` 
    });
  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message || 'Failed to sync with Meta';
    res.status(500).json({ success: false, message: `Meta Sync Error: ${errorMsg}` });
  }
};

router.post('/sync-meta', syncMetaTemplatesHandler);
router.post('/sync', syncMetaTemplatesHandler);

// GET /api/template/meta/:id/status
// Check the approval status of a Meta template
router.get('/meta/:id/status', async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template || !template.metaTemplateId) {
      return res.status(404).json({ success: false, message: 'Meta template not found' });
    }

    if (template.metaTemplateId.startsWith('local_')) {
      return res.status(400).json({ 
        success: false, 
        message: 'This template was saved as a local draft because initial Meta sync failed. Please recreate or edit it.' 
      });
    }
    
    const metaData = await getTemplateStatusFromMeta(template.metaTemplateId);
    
    if (metaData && metaData.status) {
      template.metaStatus = metaData.status;
      await template.save();
    }
    
    res.json({ success: true, status: template.metaStatus });
  } catch (error) {
    res.status(500).json({ success: false, message: error.response?.data?.error?.message || error.message });
  }
});

// GET /api/template/stats/summary
// Fetches high level metrics and chart data based on MessageLog tracking
router.get('/stats/summary', async (req, res) => {
  try {
    const MessageLog = require('../models/MessageLog');
    
    const currentWaba = process.env.META_WA_BUSINESS_ACCOUNT_ID;
    const currentPhone = process.env.META_WA_PHONE_NUMBER_ID;

    // Filter logs for this phone or waba if specified
    const logFilter = {};
    if (currentPhone || currentWaba) {
      logFilter.$or = [
        ...(currentPhone ? [{ phoneId: currentPhone }] : []),
        ...(currentWaba ? [{ wabaId: currentWaba }] : []),
        { phoneId: null, wabaId: null }
      ];
    }
    
    // Global counts based on latest webhook states
    const logs = await MessageLog.find(logFilter);
    
    let sent = 0;
    let delivered = 0;
    let read = 0;
    let failed = 0;
    
    logs.forEach(log => {
      // If it reached delivered or read, it was also sent
      if (['sent', 'delivered', 'read'].includes(log.status)) sent++;
      if (['delivered', 'read'].includes(log.status)) delivered++;
      if (log.status === 'read') read++;
      if (log.status === 'failed') failed++;
    });

    const templateFilter = { metaStatus: 'APPROVED', isActive: true };
    if (currentWaba) {
      templateFilter.wabaId = currentWaba;
    }

    const activeTemplates = await Template.countDocuments(templateFilter);
    const totalContacts = await Contact.countDocuments({ optedOut: false });
    const totalCampaigns = await Template.countDocuments({ contacts: { $not: { $size: 0 } } });

    res.json({
      success: true,
      stats: {
        sent,
        delivered,
        read,
        failed,
        activeTemplates,
        totalContacts,
        totalCampaigns,
        wabaId: currentWaba,
        phoneId: currentPhone
      },
      chartData: logs
    });
  } catch (error) {
    console.error('Stats Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

const runScheduledTemplates = async () => {
  const now = new Date();
  const due = await Template.find({ isScheduled: true, isActive: true, nextRunAt: { $lte: now }, status: { $ne: 'sending' } });

  for (const t of due) {
    console.log(`⏰ Running scheduled broadcast: ${t.title}`);
    t.status = 'sending';
    await t.save();
        runMetaBroadcast(t, t.contacts).then(async () => {
      if (t.repeatDaily) {
        const next = new Date(t.nextRunAt);
        next.setDate(next.getDate() + 1);
        await Template.findByIdAndUpdate(t._id, { nextRunAt: next, status: 'scheduled' });
      }
    });
  }
};

module.exports = router;
module.exports.runScheduledTemplates = runScheduledTemplates;