const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const os       = require('os');
const axios    = require('axios');
const mime     = require('mime-types');
const Template = require('../models/Template');
const Contact  = require('../models/Contact');
const { ConversationFlow } = require('../utils/conversationFlow');
const {
  createTemplateOnMeta,
  deleteTemplateOnMeta,
  getTemplateStatusFromMeta,
  uploadMediaToMeta,
  uploadMediaForSending,
  fetchAllTemplatesFromMeta,
} = require('../utils/metaTemplateService');
const { uploadToCloudinary, uploadUrlToCloudinary } = require('../utils/cloudinaryService');
const { getMetaCredentials } = require('../utils/metaConfigHelper');
const {
  CATEGORIES,
  CATEGORY_PRESETS,
  RULES,
  MEDIA_HEADER_FORMATS,
  toDefinition,
  buildComponents,
  assertValidDefinition,
  formatMetaError,
} = require('../utils/templateBuilder');

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

// ── Header media resolution ───────────────────────────────────────────────────
// Meta only accepts a Resumable Upload handle (`4::...`) as `header_handle`.
// A media id from /{phoneId}/media is NOT valid there, so every media header
// has to go through /app/uploads before the template submission.
const REMOTE_MEDIA_MAX_BYTES = 16 * 1024 * 1024;

const downloadToTempFile = async (url) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: REMOTE_MEDIA_MAX_BYTES,
    maxBodyLength: REMOTE_MEDIA_MAX_BYTES,
  });

  const contentType = response.headers['content-type'] || mime.lookup(url) || 'image/jpeg';
  const ext = mime.extension(contentType) ? `.${mime.extension(contentType)}` : path.extname(new URL(url).pathname) || '.jpg';
  const filePath = path.join(os.tmpdir(), `wa-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  fs.writeFileSync(filePath, Buffer.from(response.data));

  return { filePath, mimeType: contentType, size: fs.statSync(filePath).size, isTemp: true };
};

/**
 * Produces everything a media header needs:
 *   handle      – required by Meta when creating the template
 *   mediaId     – required later when sending the template
 *   cloudinaryUrl – a public URL so the dashboard preview keeps working
 *   cleanup()   – removes any temp file we created
 */
const resolveHeaderMedia = async (definition, file) => {
  const media = { handle: '', mediaId: '', cloudinaryUrl: '', cleanup: () => {} };

  if (definition.category === 'AUTHENTICATION') return media;
  if (!MEDIA_HEADER_FORMATS.includes(definition.header.type)) return media;

  let source = null;
  if (file) {
    source = { filePath: file.path, mimeType: file.mimetype, size: file.size, isTemp: false };
  } else if (/^https?:\/\//i.test(definition.header.imageUrl)) {
    try {
      source = await downloadToTempFile(definition.header.imageUrl);
      media.cleanup = () => fs.promises.unlink(source.filePath).catch(() => {});
    } catch (err) {
      const e = new Error(`Could not download the header ${definition.header.type.toLowerCase()}: ${err.message}`);
      e.status = 400;
      throw e;
    }
  } else if (definition.header.imageUrl.startsWith('/uploads/')) {
    // Earlier uploads are stored as site-relative paths — read them off disk
    // instead of trying to fetch them over the network.
    const localPath = path.join(__dirname, '..', definition.header.imageUrl);
    if (fs.existsSync(localPath)) {
      source = {
        filePath: localPath,
        mimeType: mime.lookup(localPath) || 'image/jpeg',
        size: fs.statSync(localPath).size,
        isTemp: false,
      };
    }
  } else if (definition.header.handle) {
    // Legacy record that already carries a handle — let Meta decide if it is stale.
    media.handle = definition.header.handle;
    return media;
  } else {
    // Validation already flagged the missing file; nothing to upload here.
    return media;
  }

  if (!source) return media;

  // 1. Resumable upload -> the only handle Meta accepts for template creation.
  media.handle = await uploadMediaToMeta(source.filePath, source.mimeType, source.size);

  // 2. Media id so the broadcast runner can send this template later.
  try {
    media.mediaId = await uploadMediaForSending(source.filePath, source.mimeType);
  } catch (err) {
    console.error('⚠️ Template media upload (for sending) failed:', err.response?.data || err.message);
  }

  // 3. Public URL for the dashboard preview.
  try {
    media.cloudinaryUrl = await uploadToCloudinary(source.filePath, 'zest_eat_templates');
  } catch (err) {
    console.error('⚠️ Cloudinary template upload failed:', err.message);
  }
  if (!media.cloudinaryUrl && file) {
    media.cloudinaryUrl = `/uploads/campaigns/${file.filename}`;
  }

  return media;
};

/**
 * Shared create path used by POST /meta and POST /:id/recreate:
 * normalize -> validate -> resolve media -> build components -> create on Meta.
 */
const submitTemplateToMeta = async (payload, file) => {
  const definition = toDefinition(payload);
  const warnings = assertValidDefinition(definition);

  const media = await resolveHeaderMedia(definition, file);
  try {
    const components = buildComponents(definition, media.handle);
    if (!components.some((c) => c.type === 'BODY')) {
      const e = new Error('A template needs a body component.');
      e.status = 400;
      throw e;
    }

    const metaResponse = await createTemplateOnMeta(
      definition.name,
      definition.language,
      definition.category,
      components,
    );

    return { definition, components, media, metaResponse, warnings };
  } finally {
    await media.cleanup();
  }
};

/** Maps a successful submission onto Template document fields. */
const toTemplateFields = ({ definition, components, media, metaResponse }, wabaId) => {
  const bodyComp = components.find((c) => c.type === 'BODY');
  const bodyText = bodyComp?.text || definition.body.text || '';

  return {
    name: definition.name,
    title: definition.name,
    language: definition.language,
    category: definition.category,
    components,
    imageUrl: media.cloudinaryUrl || '',
    mediaId: media.mediaId || '',
    metaTemplateId: metaResponse.id,
    metaStatus: metaResponse.status || 'PENDING',
    wabaId: wabaId || '',
    message: bodyText,
    body_text: bodyText,
    footer: definition.footer || '',
    footer_text: definition.footer || '',
    header_type: definition.header.type,
    header_text: definition.header.text || '',
    header_image_url: media.cloudinaryUrl || '',
    sample_values: bodyComp?.example?.body_text?.[0] || [],
    buttons: definition.buttons,
    status: 'draft',
  };
};

// ── Route helpers ─────────────────────────────────────────────────────────────
const parseMaybeJson = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[[{]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    return value;
  }
};

const findTemplateByAnyId = async (id) => {
  const value = String(id || '');
  if (/^[0-9a-fA-F]{24}$/.test(value)) {
    const byObjectId = await Template.findById(value);
    if (byObjectId) return byObjectId;
  }
  return (await Template.findOne({ metaTemplateId: value })) || Template.findOne({ name: value });
};

/** Single place that turns every failure mode into an HTTP response. */
const respondMetaError = (res, error) => {
  if (error.validationErrors) {
    return res.status(error.status || 400).json({
      success: false,
      message: error.message,
      validationErrors: error.validationErrors,
      warnings: error.warnings || [],
    });
  }

  const formatted = formatMetaError(error);
  const status = error.status || (formatted.code === 190 ? 401 : 400);
  console.error('❌ Template API Error:', formatted.message, '| code:', formatted.code, '| fbtrace:', formatted.fbtraceId);

  return res.status(status).json({
    success: false,
    message: formatted.message,
    metaError: formatted,
  });
};

const isTemplateMissingOnMeta = (formatted) =>
  /does not exist|not found|could not find|unknown template/i.test(
    `${formatted.message || ''} ${formatted.details || ''}`
  );

/**
 * Meta does not let a submitted template's content change, so "editing" one
 * means deleting the old definition and creating a replacement under the same
 * name. If the replacement fails the record degrades to a local draft rather
 * than pretending the old template still exists.
 */
const recreateTemplateOnMeta = async (template, payload, file) => {
  const creds = await getMetaCredentials();
  let removedOnMeta = false;

  if (template.metaTemplateId && !String(template.metaTemplateId).startsWith('local_')) {
    try {
      await deleteTemplateOnMeta(template.name, template.metaTemplateId);
      removedOnMeta = true;
    } catch (err) {
      const formatted = formatMetaError(err);
      if (!isTemplateMissingOnMeta(formatted)) {
        const e = new Error(`Meta could not delete the previous version: ${formatted.message}`);
        e.status = 400;
        e.metaError = formatted;
        throw e;
      }
    }
  }

  try {
    const result = await submitTemplateToMeta(payload, file);
    Object.assign(template, toTemplateFields(result, creds.wabaId));
    await template.save();
    return { template, warnings: result.warnings };
  } catch (err) {
    if (removedOnMeta) {
      template.metaStatus = 'DRAFT';
      template.metaTemplateId = `local_${Date.now()}`;
      await template.save().catch(() => {});
    }
    throw err;
  }
};

/** Merges request fields onto the stored record to rebuild a full payload. */
const buildRecreatePayload = (template, body) => {
  const stored = template.toObject();
  const pick = (key) => {
    const incoming = body[key];
    if (incoming !== undefined && incoming !== null && incoming !== '') return incoming;
    return stored[key];
  };

  return {
    name: pick('name'),
    language: pick('language'),
    category: pick('category'),
    // Only trust an explicit header_type: legacy records hydrate as 'NONE'
    // which would hide a header that exists in `components`.
    header_type: body.header_type !== undefined
      ? body.header_type
      : (stored.header_type && stored.header_type !== 'NONE' ? stored.header_type : undefined),
    header_text: pick('header_text'),
    header_image_url: pick('header_image_url') || stored.imageUrl,
    body_text: pick('body_text') || stored.message,
    footer_text: pick('footer_text') || stored.footer,
    sample_values: Array.isArray(body.sample_values) ? body.sample_values : stored.sample_values,
    buttons: Array.isArray(body.buttons) ? body.buttons : stored.buttons,
    components: Array.isArray(body.components) ? body.components : undefined,
    code_expiration_minutes: body.code_expiration_minutes,
  };
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

/**
 * Direct Send lets Meta generate templates automatically (`source:
 * 'AUTO_GENERATED'`, usually named `auto_generated_*`). Meta refuses to edit
 * or delete those, so the CRM must refuse first with a clear message instead of
 * surfacing a raw Graph error.
 */
const isDirectSendTemplate = (template) => Boolean(template) && (
  template.isAutoGenerated
  || String(template.source || '').toUpperCase() === 'AUTO_GENERATED'
  || /^auto_generated/i.test(template.name || '')
);

const respondTemplateLocked = (res, template) => res.status(409).json({
  success: false,
  locked: true,
  message:
    `'${template.name}' was generated automatically by Meta Direct Send, and Meta does not allow editing or ` +
    'deleting these templates. Send a Direct Send message with a different direct_send_config.template_name to ' +
    'get a new one.',
});

router.delete('/:id', async (req, res) => {
  try {
    const template = await findTemplateByAnyId(req.params.id);
    if (!template) {
      return res.json({ success: true, message: 'Template deleted' });
    }
    if (isDirectSendTemplate(template)) {
      return respondTemplateLocked(res, template);
    }

    let metaDeleted = false;
    const onMeta = template.metaTemplateId && !String(template.metaTemplateId).startsWith('local_');
    if (onMeta && template.name) {
      try {
        await deleteTemplateOnMeta(template.name, template.metaTemplateId);
        metaDeleted = true;
      } catch (err) {
        const formatted = formatMetaError(err);
        if (!isTemplateMissingOnMeta(formatted)) {
          // Keep the record so the user does not lose it while Meta still holds it.
          return res.status(formatted.code === 190 ? 401 : 400).json({
            success: false,
            message: `Meta could not delete '${template.name}': ${formatted.message}`,
            metaError: formatted,
          });
        }
      }
    }

    await Template.findByIdAndDelete(template._id);
    res.json({
      success: true,
      metaDeleted,
      message: metaDeleted ? 'Template removed from Meta and CRM' : 'Template deleted',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/template/:id
// Local draft edits are applied directly. Once a template is on Meta its content
// is immutable, so a content change returns `requiresRecreate` and the studio
// offers "Save & recreate" (POST /:id/recreate) instead.
router.put('/:id', upload.single('media'), async (req, res) => {
  try {
    const template = await findTemplateByAnyId(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    const body = {
      ...req.body,
      components: parseMaybeJson(req.body.components),
      buttons: parseMaybeJson(req.body.buttons),
      sample_values: parseMaybeJson(req.body.sample_values),
    };

    // ── status-only updates (dashboard list view) ────────────────────────────
    if (isDirectSendTemplate(template) && !(body.recreate === true || body.recreate === 'true')) {
      return respondTemplateLocked(res, template);
    }

    const metaStatusValues = Template.schema.path('metaStatus').enumValues;
    const statusValues = Template.schema.path('status').enumValues;
    let statusTouched = false;
    if (body.metaStatus) {
      const next = String(body.metaStatus).toUpperCase();
      if (metaStatusValues.includes(next) && template.metaStatus !== next) {
        template.metaStatus = next;
        statusTouched = true;
      }
    }
    if (body.status && statusValues.includes(body.status) && template.status !== body.status) {
      template.status = body.status;
      statusTouched = true;
    }

    // ── content diff ─────────────────────────────────────────────────────────
    const nextContent = {
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      language: body.language !== undefined ? String(body.language).trim() : undefined,
      category: body.category !== undefined ? String(body.category).toUpperCase() : undefined,
      components: Array.isArray(body.components) ? body.components : undefined,
      header_type: body.header_type !== undefined ? String(body.header_type).toUpperCase() : undefined,
      header_text: body.header_text !== undefined ? String(body.header_text) : undefined,
      header_image_url: body.header_image_url !== undefined ? String(body.header_image_url) : undefined,
      body_text: body.body_text !== undefined ? body.body_text : body.message,
      footer_text: body.footer_text !== undefined ? body.footer_text : body.footer,
      buttons: Array.isArray(body.buttons) ? body.buttons : undefined,
      sample_values: Array.isArray(body.sample_values) ? body.sample_values : undefined,
    };

    const differs = (a, b) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
    const changedFields = Object.keys(nextContent).filter(
      (key) => nextContent[key] !== undefined && differs(nextContent[key], template[key]),
    );
    const hasMedia = Boolean(req.file);
    const isOnMeta = Boolean(template.metaTemplateId) && !String(template.metaTemplateId).startsWith('local_');

    // Nothing content-related changed: a pure status sync.
    if (!changedFields.length && !hasMedia) {
      if (statusTouched) await template.save();
      return res.json({ success: true, template, message: 'Template updated' });
    }

    const wantsRecreate = body.recreate === true || body.recreate === 'true';

    if (isOnMeta && !wantsRecreate) {
      return res.status(409).json({
        success: false,
        requiresRecreate: true,
        message: `Meta does not allow editing '${template.name}' once it is submitted. ` +
          'Recreating deletes the current version and submits a new one for review.',
        changedFields,
        template,
      });
    }

    // Local draft: rewrite the document in place.
    if (!isOnMeta) {
      const payload = buildRecreatePayload(template, {
        ...body,
        header_type: nextContent.header_type,
        header_image_url: nextContent.header_image_url,
        body_text: nextContent.body_text,
        footer_text: nextContent.footer_text,
      });
      const definition = toDefinition(payload);
      const warnings = assertValidDefinition(definition);

      let components = template.components;
      let media = { handle: '', mediaId: '', cloudinaryUrl: '', cleanup: () => {} };
      let mediaReady = true;
      try {
        media = await resolveHeaderMedia(definition, req.file);
        components = buildComponents(definition, media.handle);
      } catch (mediaErr) {
        // WhatsApp is not configured or the upload failed — the draft itself is
        // still worth saving, so keep the previous components and warn.
        mediaReady = false;
        warnings.push({
          field: 'header',
          message: `Header media could not be prepared (${mediaErr.message}). The draft was saved without it.`,
        });
      }

      try {
        const bodyComp = components.find((c) => c.type === 'BODY');
        Object.assign(template, {
          name: definition.name,
          title: definition.name,
          language: definition.language,
          category: definition.category,
          components,
          message: bodyComp?.text || definition.body.text || '',
          body_text: bodyComp?.text || definition.body.text || '',
          footer: definition.footer || '',
          footer_text: definition.footer || '',
          header_type: definition.header.type,
          header_text: definition.header.text || '',
          header_image_url: media.cloudinaryUrl || template.header_image_url || '',
          imageUrl: media.cloudinaryUrl || template.imageUrl || '',
          mediaId: media.mediaId || template.mediaId || '',
          sample_values: bodyComp?.example?.body_text?.[0] || [],
          buttons: definition.buttons,
        });
        await template.save();
        return res.json({
          success: true,
          template,
          warnings,
          message: mediaReady ? 'Draft template updated' : 'Draft saved locally — header media needs attention',
        });
      } finally {
        await media.cleanup();
      }
    }

    // Explicit recreate against Meta.
    const payload = buildRecreatePayload(template, body);
    const result = await recreateTemplateOnMeta(template, payload, req.file);

    res.json({
      success: true,
      template: result.template,
      warnings: result.warnings,
      message: 'Template recreated on Meta. Approval usually takes a few minutes.',
    });
  } catch (err) {
    console.error('Update template error:', err.message);
    respondMetaError(res, err);
  }
});

// POST /api/template/:id/recreate
// Delete the current Meta version and submit the (edited) content as a new one.
router.post('/:id/recreate', upload.single('media'), async (req, res) => {
  try {
    const template = await findTemplateByAnyId(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    if (isDirectSendTemplate(template)) {
      return respondTemplateLocked(res, template);
    }

    const body = {
      ...req.body,
      components: parseMaybeJson(req.body.components),
      buttons: parseMaybeJson(req.body.buttons),
      sample_values: parseMaybeJson(req.body.sample_values),
    };

    const payload = buildRecreatePayload(template, body);
    const result = await recreateTemplateOnMeta(template, payload, req.file);

    res.json({
      success: true,
      template: result.template,
      warnings: result.warnings,
      message: 'Template recreated on Meta. Approval usually takes a few minutes.',
    });
  } catch (err) {
    console.error('Recreate template error:', err.message);
    respondMetaError(res, err);
  }
});

// GET /api/template/presets
// Category presets + field limits so the studio stays in sync with the backend.
router.get('/presets', (req, res) => {
  res.json({ success: true, categories: CATEGORIES, presets: CATEGORY_PRESETS, rules: RULES });
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
// Creates a MARKETING / UTILITY / AUTHENTICATION template on the WhatsApp Cloud
// API. Accepts the friendly studio payload (header_type/body_text/buttons/...)
// as well as a legacy raw `components` array.
router.post('/meta', upload.single('media'), async (req, res) => {
  try {
    const creds = await getMetaCredentials();

    const payload = {
      ...req.body,
      components: parseMaybeJson(req.body.components),
      buttons: parseMaybeJson(req.body.buttons),
      sample_values: parseMaybeJson(req.body.sample_values),
    };

    const result = await submitTemplateToMeta(payload, req.file);
    const fields = toTemplateFields(result, creds.wabaId);

    // Re-submitting the same name + language replaces the stale local record
    // instead of leaving duplicate rows behind.
    const existing = await Template.findOne({
      name: fields.name,
      language: fields.language,
      isScheduled: { $ne: true },
    });
    const template = existing || new Template();
    Object.assign(template, fields);
    await template.save();

    res.json({
      success: true,
      template,
      warnings: result.warnings,
      preview: {
        components: result.components,
        samples: template.sample_values,
      },
      message: `Template '${result.definition.name}' submitted to Meta (${result.metaResponse.status || 'PENDING'}). Approval usually takes a few minutes.`,
    });
  } catch (error) {
    console.error('Meta Template API Error:', error.message);
    respondMetaError(res, error);
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
      source: metaData.source || '',
      isAutoGenerated: String(metaData.source || '').toUpperCase() === 'AUTO_GENERATED'
        || /^auto_generated/i.test(metaData.name || ''),
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
        existing.source = mt.source || '';
        existing.isAutoGenerated = String(mt.source || '').toUpperCase() === 'AUTO_GENERATED'
          || /^auto_generated/i.test(mt.name || '');
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
          source: mt.source || '',
          isAutoGenerated: String(mt.source || '').toUpperCase() === 'AUTO_GENERATED'
            || /^auto_generated/i.test(mt.name || ''),
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