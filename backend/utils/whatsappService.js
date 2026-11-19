const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { getMetaCredentials, verifyMetaConnection } = require('./metaConfigHelper');

// Get Meta config dynamically
const getMetaConfig = async () => {
  const creds = await getMetaCredentials();
  
  if (!creds.token || !creds.phoneId) {
    console.warn('⚠️ [WA] Meta API credentials missing');
  }
  
  return {
    creds,
    url: `https://graph.facebook.com/${creds.version}/${creds.phoneId}/messages`,
    // Marketing Messages API for WhatsApp: same payload as /messages, but it adds
    // quality-based delivery and benchmark reporting for MARKETING templates.
    marketingUrl: `https://graph.facebook.com/${creds.version}/${creds.phoneId}/marketing_messages`,
    mediaUrl: `https://graph.facebook.com/${creds.version}/${creds.phoneId}/media`,
    headers: {
      'Authorization': `Bearer ${creds.token}`,
      'Content-Type': 'application/json'
    }
  };
};

const getStatus = async () => {
  const creds = await getMetaCredentials();
  if (!creds.token || !creds.phoneId || !creds.wabaId) return 'DISCONNECTED';
  
  // Live ping check
  const testRes = await verifyMetaConnection(creds);
  return testRes.reachable ? 'CONNECTED' : 'DISCONNECTED';
};

// Format phone for Meta API (just the number without @s.whatsapp.net, must include country code)
const formatPhone = (phone) => {
  let c = String(phone).replace(/\D/g, '');
  if (c.startsWith('0')) c = '91' + c.slice(1);
  if (!c.startsWith('91') && c.length === 10) c = '91' + c;
  return c;
};

// No longer applicable but kept for compatibility
const isSelfSend = () => false;

const sendRequest = async (payload, endpoint = 'messages') => {
  const config = await getMetaConfig();
  const url = endpoint === 'marketing_messages' ? config.marketingUrl : config.url;
  if (!url || !config.headers.Authorization.includes('Bearer ')) {
    throw new Error('Meta API credentials missing or invalid');
  }
  
  try {
    const response = await axios.post(url, payload, { headers: config.headers });
    return response.data;
  } catch (error) {
    const metaError = error.response?.data?.error;
    console.error('❌ [WA] Meta API Error:', JSON.stringify(metaError || error.message, null, 2));
    // Carries code / subcode / fbtrace_id through so callers can decode it with
    // templateBuilder.formatMetaError instead of a bare message string.
    const wrapped = new Error(metaError?.message || error.message);
    wrapped.metaError = metaError || null;
    wrapped.status = error.response?.status;
    throw wrapped;
  }
};

const sendTextMessage = async (phone, text) => {
  const to = formatPhone(phone);
  let finalText = text;
  if (finalText && !finalText.toUpperCase().includes('STOP')) {
    finalText = `${finalText}\n\n_Reply STOP to stop automated messages._`;
  }
  console.log(`📤 [WA] Sending text to ${to}: "${finalText.replace(/\n/g, ' ').slice(0, 40)}..."`);
  
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: finalText }
  };
  
  return await sendRequest(payload);
};

const sendImageMessage = async (phone, imagePath, caption = '') => {
  const to = formatPhone(phone);
  console.log(`📤 [WA] Sending image to ${to}: "${caption.slice(0, 30)}"`);
  
  let mediaObj = {};
  
  // If it's a URL, we can send it directly
  if (typeof imagePath === 'string' && imagePath.startsWith('http')) {
    mediaObj = { link: imagePath };
  } else {
    // If it's a local file, we need to upload it to Meta first to get a media ID
    const config = await getMetaConfig();
    const formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath));
    formData.append('messaging_product', 'whatsapp');
    
    try {
      const uploadRes = await axios.post(config.mediaUrl, formData, {
        headers: {
          ...config.headers,
          ...formData.getHeaders(),
        }
      });
      mediaObj = { id: uploadRes.data.id };
    } catch (err) {
      console.error('❌ [WA] Media upload failed:', err.response?.data || err.message);
      throw err;
    }
  }

  if (caption) {
    mediaObj.caption = caption;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image: mediaObj
  };
  
  return await sendRequest(payload);
};

const sendButtons = async (phone, text, buttons, title = '', footer = '') => {
  const to = formatPhone(phone);
  
  const formattedButtons = buttons.slice(0, 3).map((btn, index) => ({
    type: 'reply',
    reply: {
      id: btn.buttonId || `btn_${index}`,
      title: (btn.buttonText?.displayText || btn.id || 'Button').slice(0, 20)
    }
  }));

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text },
      action: { buttons: formattedButtons }
    }
  };

  if (title) payload.interactive.header = { type: 'text', text: title };
  if (footer) payload.interactive.footer = { text: footer };

  return await sendRequest(payload);
};

const sendPoll = async (phone, name, choices) => {
  const to = formatPhone(phone);
  const optionsText = choices.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const fullText = `*${name}*\n\n${optionsText}\n\n_Please reply with the option number._`;
  
  return await sendTextMessage(phone, fullText);
};

const sendListMenu = async (phone, options) => {
  const to = formatPhone(phone);
  
  const sections = (options.sections || []).map(sec => ({
    title: sec.title || 'Options',
    rows: (sec.rows || []).slice(0, 10).map(r => ({
      id: r.rowId || r.title,
      title: r.title.slice(0, 24),
      description: r.description ? r.description.slice(0, 72) : ''
    }))
  }));

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: options.title || 'Menu' },
      body: { text: options.description || 'Please select an option' },
      footer: { text: options.footer || '' },
      action: {
        button: (options.buttonText || 'View Menu').slice(0, 20),
        sections
      }
    }
  };

  return await sendRequest(payload);
};

//──────────────────────────────────────────────────────────────────────────────
// Direct Send — business-initiated messages without an approved template
//
// Adding `category` to POST /<PHONE_NUMBER_ID>/messages is what lets a message
// go out as utility/authentication outside the 24-hour customer service window.
// Omitting `category` (or sending "service") keeps the normal behaviour.
// Marketing is NOT supported by Direct Send.
//──────────────────────────────────────────────────────────────────────────────

const DIRECT_SEND_CATEGORIES = ['utility', 'authentication', 'service'];
const DIRECT_SEND_HEADER_TYPES = ['none', 'text', 'image', 'video', 'document'];
const DIRECT_SEND_MEDIA_HEADERS = ['image', 'video', 'document'];

const DIRECT_SEND_LIMITS = {
  bodyMax: 1024,
  headerTextMax: 60,
  buttonTextMax: 20,
  quickReplyMax: 3, // reply buttons per interactive message
  ttlSecondsMax: 2592000, // 30 days
  templateNameMax: 512,
  templateNamePattern: /^[a-z0-9_]+$/,
};

/** Media headers need at least one of `link` (public URL) or `id` (media ID). */
const normalizeDirectSendHeader = (header) => {
  const raw = header || {};
  const type = String(raw.type || 'none').trim().toLowerCase();
  return {
    type: DIRECT_SEND_HEADER_TYPES.includes(type) ? type : 'none',
    text: String(raw.text || '').trim(),
    link: String(raw.link || '').trim(),
    id: String(raw.id || '').trim(),
    filename: String(raw.filename || '').trim(),
  };
};

const normalizeDirectSendButtons = (buttons) => (Array.isArray(buttons) ? buttons : [])
  .filter((btn) => btn && String(btn.text || '').trim())
  .map((btn) => ({
    type: String(btn.type || 'reply').trim().toLowerCase() === 'cta_url' ? 'cta_url' : 'reply',
    text: String(btn.text || '').trim(),
    url: String(btn.url || '').trim(),
  }));

/** Validates a Direct Send request. Returns `{ errors, warnings }`. */
const validateDirectSend = ({ body, category, templateName, ttlSeconds, header, buttons }) => {
  const errors = [];
  const warnings = [];
  const cat = String(category || 'utility').trim().toLowerCase();
  const name = String(templateName || '').trim();
  const head = normalizeDirectSendHeader(header);
  const btnList = normalizeDirectSendButtons(buttons);

  if (!DIRECT_SEND_CATEGORIES.includes(cat)) {
    errors.push(
      `category must be one of: ${DIRECT_SEND_CATEGORIES.join(', ')}. Marketing is not supported by Direct Send.`
    );
  }

  if (String(body || '').trim().length > DIRECT_SEND_LIMITS.bodyMax) {
    errors.push(`Message body must be at most ${DIRECT_SEND_LIMITS.bodyMax} characters.`);
  }

  if (name) {
    if (cat !== 'utility') {
      errors.push('direct_send_config.template_name is only supported for utility messages.');
    } else if (!DIRECT_SEND_LIMITS.templateNamePattern.test(name)) {
      errors.push('Template name may only contain lowercase letters, numbers and underscores.');
    } else if (name.length > DIRECT_SEND_LIMITS.templateNameMax) {
      errors.push(`Template name must be at most ${DIRECT_SEND_LIMITS.templateNameMax} characters.`);
    }
  }

  if (ttlSeconds !== undefined && ttlSeconds !== null && ttlSeconds !== '') {
    const ttl = Number(ttlSeconds);
    if (!Number.isFinite(ttl) || ttl < 0 || ttl > DIRECT_SEND_LIMITS.ttlSecondsMax) {
      errors.push(`ttl_seconds must be between 0 and ${DIRECT_SEND_LIMITS.ttlSecondsMax}.`);
    }
  }

  // ── header (interactive messages only) ───────────────────────────────
  if (head.type !== 'none') {
    if (head.type === 'text') {
      if (!head.text) errors.push('A text header requires header.text.');
      else if (head.text.length > DIRECT_SEND_LIMITS.headerTextMax) {
        errors.push(`Header text must be at most ${DIRECT_SEND_LIMITS.headerTextMax} characters.`);
      }
    } else if (DIRECT_SEND_MEDIA_HEADERS.includes(head.type)) {
      if (!head.link && !head.id) {
        errors.push(
          `A ${head.type} header requires at least one of header.link (public URL) or header.id (media ID).`
        );
      }
      if (head.link && !/^https?:\/\//i.test(head.link)) {
        errors.push('header.link must be a public http(s) URL.');
      }
    }
    // A header only exists on interactive messages, and interactive messages
    // need an action, so a header without a button cannot be sent.
    if (!btnList.length) {
      errors.push('A header can only be sent on an interactive message, so add at least one button.');
    }
  }

  // ── buttons ─────────────────────────────────────────────────────────
  const ctaCount = btnList.filter((b) => b.type === 'cta_url').length;
  if (ctaCount > 1) errors.push('Only one call-to-action (CTA URL) button is allowed per message.');
  if (ctaCount && btnList.length > 1) {
    errors.push('A CTA URL button cannot be combined with reply buttons in the same message.');
  }
  if (btnList.length > DIRECT_SEND_LIMITS.quickReplyMax) {
    errors.push(`Up to ${DIRECT_SEND_LIMITS.quickReplyMax} reply buttons are allowed.`);
  }
  btnList.forEach((btn, idx) => {
    if (btn.text.length > DIRECT_SEND_LIMITS.buttonTextMax) {
      errors.push(`Button ${idx + 1} text must be at most ${DIRECT_SEND_LIMITS.buttonTextMax} characters.`);
    }
    if (btn.type === 'cta_url' && !/^https?:\/\//i.test(btn.url)) {
      errors.push(`Button ${idx + 1} needs a URL starting with http:// or https://.`);
    }
  });

  if (cat === 'authentication') {
    warnings.push(
      'Direct Send authentication is alpha and access-restricted. If it is rejected, send an approved ' +
      'AUTHENTICATION template instead.'
    );
  }

  return { errors, warnings };
};

/**
 * Builds the Graph API payload for a Direct Send message.
 *
 * Plain text when there are no buttons; otherwise an interactive message
 * (`button` for reply buttons, `cta_url` for a single call-to-action), with an
 * optional media/text header per the Direct Send media-header docs.
 */
const buildDirectSendPayload = ({
  to,
  body,
  category,
  templateName,
  ttlSeconds,
  header,
  buttons,
  previewUrl,
}) => {
  const head = normalizeDirectSendHeader(header);
  const btnList = normalizeDirectSendButtons(buttons);

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
  };

  if (!btnList.length) {
    payload.type = 'text';
    payload.text = { preview_url: Boolean(previewUrl), body };
  } else if (btnList.length === 1 && btnList[0].type === 'cta_url') {
    payload.type = 'interactive';
    payload.interactive = {
      type: 'cta_url',
      body: { text: body },
      action: {
        name: 'cta_url',
        parameters: { display_text: btnList[0].text, url: btnList[0].url },
      },
    };
  } else {
    payload.type = 'interactive';
    payload.interactive = {
      type: 'button',
      body: { text: body },
      action: {
        buttons: btnList.map((btn, idx) => ({
          type: 'reply',
          reply: { id: `btn_${idx}`, title: btn.text.slice(0, DIRECT_SEND_LIMITS.buttonTextMax) },
        })),
      },
    };
  }

  if (payload.interactive && head.type !== 'none') {
    if (head.type === 'text') {
      payload.interactive.header = { type: 'text', text: head.text };
    } else {
      const media = {};
      if (head.link) media.link = head.link;
      if (head.id) media.id = head.id;
      if (head.type === 'document' && head.filename) media.filename = head.filename;
      payload.interactive.header = { type: head.type, [head.type]: media };
    }
  }

  payload.category = String(category || 'utility').trim().toLowerCase();
  const name = String(templateName || '').trim();
  if (name) payload.direct_send_config = { template_name: name };
  if (ttlSeconds !== null && ttlSeconds !== undefined && ttlSeconds !== '') {
    payload.ttl_seconds = Number(ttlSeconds);
  }

  return payload;
};

/**
 * Sends a message through Meta Direct Send.
 * `options`: { category, templateName, ttlSeconds, previewUrl, header, buttons }
 */
const sendDirectSendMessage = async (phone, text, options = {}) => {
  const {
    category = 'utility',
    templateName = '',
    ttlSeconds = null,
    previewUrl = false,
    header = null,
    buttons = [],
  } = options;

  const body = String(text || '').trim();
  const { errors, warnings } = validateDirectSend({
    body, category, templateName, ttlSeconds, header, buttons,
  });
  if (errors.length) {
    const err = new Error(errors.join(' '));
    err.status = 400;
    err.validationErrors = errors;
    throw err;
  }

  const to = formatPhone(phone);
  const cat = String(category || 'utility').trim().toLowerCase();
  const name = String(templateName || '').trim();

  const payload = buildDirectSendPayload({
    to, body, category, templateName, ttlSeconds, header, buttons, previewUrl,
  });

  console.log(
    `📤 [WA] Direct Send (${cat}${payload.type === 'interactive' ? ', interactive' : ''}) to ${to}` +
    `${name ? ` via '${name}'` : ''}`
  );
  const result = await sendRequest(payload);
  if (warnings.length) result.directSendWarnings = warnings;
  return result;
};

/**
 * True when the failure looks like the account is simply not onboarded to the
 * Marketing Messages API (TOS not accepted, country not eligible, endpoint
 * unknown) rather than a real template problem.
 */
const isMarketingApiUnavailable = (err) => {
  if (err?.status === 403 || err?.status === 404) return true;
  const code = err?.metaError?.code;
  return code === 100 && /marketing/i.test(String(err?.message || ''));
};

/**
 * Sends an approved template message.
 *
 * `options.category` decides the endpoint: MARKETING templates go to
 * /marketing_messages (the Marketing Messages API for WhatsApp), which adds
 * quality-based delivery. Everything else stays on /messages.
 *
 * /marketing_messages requires the account to have accepted the marketing TOS,
 * so if Meta says the endpoint is unavailable we retry on /messages instead of
 * failing a send that Cloud API could still deliver.
 */
const sendMetaTemplate = async (phone, templateName, languageCode = 'en', components = [], options = {}) => {
  const to = formatPhone(phone);
  const isMarketing = String(options.category || '').toUpperCase() === 'MARKETING';
  const endpoint = isMarketing ? 'marketing_messages' : 'messages';
  console.log(`📤 [WA] Sending Meta Template '${templateName}' to ${to} via /${endpoint}`);
  
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode
      }
    }
  };
  
  if (components && components.length > 0) {
    payload.template.components = components;
  }

  try {
    return await sendRequest(payload, endpoint);
  } catch (err) {
    if (!isMarketing || !isMarketingApiUnavailable(err)) throw err;
    console.warn(
      `⚠️ [WA] /marketing_messages unavailable (${err.message}). Retrying on /messages — ` +
      'accept the marketing TOS in App Dashboard > WhatsApp > Quickstart to enable delivery optimizations.'
    );
    const result = await sendRequest(payload, 'messages');
    result.marketingApiFallback = true;
    return result;
  }
};

module.exports = {
  getStatus,
  sendTextMessage,
  sendWhatsAppMessage: sendTextMessage,
  sendImageMessage,
  sendButtons,
  sendPoll,
  sendListMenu,
  formatPhone,
  isSelfSend,
  sendMetaTemplate,
  DIRECT_SEND_CATEGORIES,
  DIRECT_SEND_HEADER_TYPES,
  DIRECT_SEND_LIMITS,
  validateDirectSend,
  buildDirectSendPayload,
  sendDirectSendMessage,
};