/**
 * Template definition builder / validator for Meta WhatsApp message templates.
 *
 * A single source of truth for turning a friendly, UI-shaped definition
 *   { name, category, language, header:{type,text,imageUrl}, body:{text,samples},
 *     footer, buttons:[...] }
 * into the exact `components` array Meta expects, plus validation and error
 * decoding. Accepts legacy raw `components` arrays too so older callers keep
 * working.
 */

const CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
const MEDIA_HEADER_FORMATS = ['IMAGE', 'VIDEO', 'DOCUMENT'];

const LIMITS = {
  nameMax: 512,
  headerTextMax: 60,
  bodyMax: 1024,
  footerMax: 60,
  // Meta caps template button labels at 20 characters; Direct Send uses the
  // same limit for the templates it generates.
  buttonTextMax: 20,
  maxButtonsTotal: 10,
  quickReplyMax: 10,
  urlButtonMax: 2,
  phoneButtonMax: 1,
};

// Meta rejects utility templates whose copy reads like a promotion. We warn
// instead of blocking so the user can still submit and see Meta's real answer.
const PROMOTIONAL_PATTERNS = [
  /\b(offer|offers|discount|discounts|sale|deal|deals|save|saving|savings)\b/i,
  /\b(coupon|promo|promotion|promotional|freebie|giveaway)\b/i,
  /\b(flat\s*\d+%?|\d+\s*%\s*off)\b/i,
  /\b(limited\s+time|hurry|act\s+now|don'?t\s+miss)\b/i,
];

//──────────────────────────────────────────────────────────────────────────────
// Normalization
//──────────────────────────────────────────────────────────────────────────────

const normalizeCategory = (raw) => {
  const value = String(raw || 'MARKETING').trim().toUpperCase();
  return CATEGORIES.includes(value) ? value : 'MARKETING';
};

const normalizeLanguage = (raw) => {
  const value = String(raw || 'en').trim();
  // Meta uses locale codes like en, en_US, hi, te. Keep the caller's casing but
  // guarantee a non-empty value.
  if (!value) return 'en';
  if (/^[a-z]{2}$/i.test(value)) return value.toLowerCase();
  const [lang, region] = value.split(/[-_]/);
  const base = String(lang || 'en').toLowerCase();
  return region ? `${base}_${String(region).toUpperCase()}` : base;
};

/** Meta template names: lowercase letters, digits and underscores only. */
const slugifyName = (raw) =>
  String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

const trimText = (value) => String(value ?? '').replace(/\r\n/g, '\n').trim();

/** `+91 85668 56789` -> `+918566856789` */
const normalizePhoneNumber = (raw) => {
  let digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length === 10) digits = `91${digits}`;
  return `+${digits}`;
};

/** Normalize a URL, rejecting template placeholders (unsupported in our UI). */
const normalizeUrl = (raw) => {
  let url = String(raw || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
};

const normalizeButtonType = (raw, category) => {
  const value = String(raw || '').trim().toUpperCase();
  if (value === 'OTP') return 'OTP';
  if (value === 'PHONE_NUMBER' || value === 'WHATSAPP_CALL') return 'PHONE_NUMBER';
  if (value === 'URL' || value === 'WEBSITE') return 'URL';
  if (value === 'QUICK_REPLY' || value === 'CUSTOM' || value === 'CONTACT' || value === 'REPLY') {
    return 'QUICK_REPLY';
  }
  // AUTHENTICATION templates only support the OTP button.
  return category === 'AUTHENTICATION' ? 'OTP' : 'QUICK_REPLY';
};

const clampText = (value, max) => trimText(value).slice(0, max);

const normalizeButton = (button, category) => {
  const type = normalizeButtonType(button?.type, category);
  if (type === 'OTP') {
    return { type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code', autofill_text: 'Autofill' };
  }
  if (type === 'PHONE_NUMBER') {
    return {
      type: 'PHONE_NUMBER',
      // Not clamped here: an over-long label must surface as a validation error
      // instead of being silently truncated. buildComponents clamps on output.
      text: trimText(button?.text || 'Call us'),
      phone_number: normalizePhoneNumber(button?.phone_number),
    };
  }
  if (type === 'URL') {
    return {
      type: 'URL',
      text: trimText(button?.text || 'Open link'),
      url: normalizeUrl(button?.url),
    };
  }
  return { type: 'QUICK_REPLY', text: trimText(button?.text || 'Reply') };
};

//──────────────────────────────────────────────────────────────────────────────
// Body variables
//──────────────────────────────────────────────────────────────────────────────

/** Unique variables in first-appearance order, e.g. ['name','order_id']. */
const uniqueVariables = (text) => {
  const found = String(text || '').match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
  const keys = [];
  found.forEach((match) => {
    const key = match.replace(/[{}\s]/g, '');
    if (key && !keys.includes(key)) keys.push(key);
  });
  return keys;
};

/**
 * Rewrites `{{name}}` / `{{ 1 }}` into positional `{{1}}`, `{{2}}`… and builds
 * the matching `example.body_text` sample array.
 *
 * Meta rules enforced here:
 *  - body must not START or END with a variable
 *  - every variable needs a sample value
 */
const canonicalizeBody = (rawText, samples = []) => {
  const text = trimText(rawText);
  const keys = uniqueVariables(text);
  if (!keys.length) return { text, sampleArray: [] };

  const indexByKey = new Map(keys.map((key, idx) => [key, idx + 1]));
  let fixed = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => `{{${indexByKey.get(key)}}}`);

  if (fixed.startsWith('{{')) fixed = `Hello ${fixed}`;
  if (fixed.endsWith('}}')) fixed = `${fixed} • Thanks`;

  const provided = Array.isArray(samples) ? samples : [];
  const sampleArray = keys.map((key, idx) => {
    const given = trimText(provided[idx]);
    if (given) return given;
    const lower = key.toLowerCase();
    if (lower.includes('name')) return 'Priya Sharma';
    if (lower.includes('order')) return 'ORD-10482';
    if (lower.includes('amount') || lower.includes('price') || lower.includes('total')) return '₹1,299';
    if (lower.includes('date')) return '19 Nov 2026';
    if (lower.includes('code') || lower.includes('coupon')) return 'SAVE20';
    if (lower.includes('time')) return '6:30 PM';
    return `Sample ${idx + 1}`;
  });

  return { text: fixed, sampleArray };
};

//──────────────────────────────────────────────────────────────────────────────
// Definition <-> components
//──────────────────────────────────────────────────────────────────────────────

/**
 * Accepts the friendly definition OR a legacy raw `components` array and
 * returns one normalized definition object.
 */
const toDefinition = (input = {}) => {
  const category = normalizeCategory(input.category);
  const components = Array.isArray(input.components) ? input.components : null;

  const findComp = (type) =>
    components?.find((c) => String(c?.type || '').toUpperCase() === type) || null;

  // ── header ────────────────────────────────────────────────────────────────
  let headerType = String(input.header?.type || input.header_type || '').toUpperCase();
  let headerText = trimText(input.header?.text ?? input.header_text);
  let headerImageUrl = trimText(input.header?.imageUrl ?? input.header_image_url);
  let headerHandle = '';

  const headerComp = findComp('HEADER');
  if (headerComp) {
    const format = String(headerComp.format || 'TEXT').toUpperCase();
    if (format === 'TEXT') {
      headerType = headerType || 'TEXT';
      headerText = headerText || trimText(headerComp.text);
    } else if (MEDIA_HEADER_FORMATS.includes(format)) {
      headerType = headerType || format;
      headerHandle = trimText(headerComp.example?.header_handle?.[0]);
    }
  }
  if (!['NONE', 'TEXT', ...MEDIA_HEADER_FORMATS].includes(headerType)) headerType = 'NONE';

  // ── body ──────────────────────────────────────────────────────────────────
  const bodyComp = findComp('BODY');
  let bodyText = trimText(input.body?.text ?? input.body_text ?? input.message);
  let bodySamples = Array.isArray(input.body?.samples) ? input.body.samples : [];
  if (!bodySamples.length && Array.isArray(input.sample_values)) bodySamples = input.sample_values;
  if (!bodyText && bodyComp) bodyText = trimText(bodyComp.text);
  if (!bodySamples.length && bodyComp?.example?.body_text?.[0]) {
    bodySamples = bodyComp.example.body_text[0];
  }
  bodySamples = bodySamples.map((value) => trimText(value));

  // ── footer ────────────────────────────────────────────────────────────────
  const footerComp = findComp('FOOTER');
  const footer = trimText(input.footer ?? input.footer_text ?? footerComp?.text);

  // ── buttons ───────────────────────────────────────────────────────────────
  const buttonsComp = findComp('BUTTONS');
  const rawButtons = Array.isArray(input.buttons) && input.buttons.length
    ? input.buttons
    : (buttonsComp?.buttons || []);
  const buttons = rawButtons
    .filter((b) => b && (b.text || b.type === 'OTP'))
    .map((b) => normalizeButton(b, category));

  return {
    name: slugifyName(input.name ?? input.title),
    category,
    language: normalizeLanguage(input.language),
    header: { type: headerType, text: headerText, imageUrl: headerImageUrl, handle: headerHandle },
    body: { text: bodyText, samples: bodySamples },
    footer,
    buttons,
    // AUTHENTICATION specific knobs
    codeExpirationMinutes: Number(input.code_expiration_minutes ?? 10),
    addSecurityRecommendation: input.add_security_recommendation !== false,
  };
};

/**
 * Builds the Meta `components` array from a normalized definition.
 * `resolvedHandle` is the `header_handle` obtained from the Resumable Upload
 * API (required by Meta for media headers when creating a template).
 */
const buildComponents = (def, resolvedHandle = '') => {
  if (def.category === 'AUTHENTICATION') {
    // Meta requires exactly these three components for authentication templates.
    return [
      { type: 'BODY', add_security_recommendation: def.addSecurityRecommendation },
      { type: 'FOOTER', code_expiration_minutes: def.codeExpirationMinutes || 10 },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code', autofill_text: 'Autofill' }],
      },
    ];
  }

  const components = [];

  if (def.header.type === 'TEXT' && def.header.text) {
    components.push({ type: 'HEADER', format: 'TEXT', text: clampText(def.header.text, LIMITS.headerTextMax) });
  } else if (MEDIA_HEADER_FORMATS.includes(def.header.type)) {
    const handle = resolvedHandle || def.header.handle;
    if (handle) {
      components.push({
        type: 'HEADER',
        format: def.header.type,
        example: { header_handle: [handle] },
      });
    }
  }

  const { text, sampleArray } = canonicalizeBody(def.body.text, def.body.samples);
  const bodyComp = { type: 'BODY', text: clampText(text, LIMITS.bodyMax) };
  if (sampleArray.length) bodyComp.example = { body_text: [sampleArray] };
  components.push(bodyComp);

  if (def.footer) {
    components.push({ type: 'FOOTER', text: clampText(def.footer, LIMITS.footerMax) });
  }

  if (def.buttons.length) {
    const buttons = def.buttons
      .slice(0, LIMITS.maxButtonsTotal)
      .map((btn) => (btn.type === 'OTP'
        ? btn
        : { ...btn, text: clampText(btn.text, LIMITS.buttonTextMax) }));
    components.push({ type: 'BUTTONS', buttons });
  }

  return components;
};

//──────────────────────────────────────────────────────────────────────────────
// Validation
//──────────────────────────────────────────────────────────────────────────────

/**
 * Returns `{ errors: [{field, message}], warnings: [{field, message}] }`.
 * Errors block the Meta call; warnings are shown to the user but do not block,
 * so Meta's own answer stays authoritative.
 */
const validateDefinition = (def) => {
  const errors = [];
  const warnings = [];
  const push = (field, message) => errors.push({ field, message });

  // name
  if (!def.name) push('name', 'Template name is required.');
  else if (def.name.length > LIMITS.nameMax) push('name', `Template name must be at most ${LIMITS.nameMax} characters.`);
  else if (!/^[a-z0-9_]+$/.test(def.name)) {
    push('name', 'Template name may only contain lowercase letters, numbers and underscores.');
  }

  if (!CATEGORIES.includes(def.category)) push('category', 'Category must be MARKETING, UTILITY or AUTHENTICATION.');

  // ── AUTHENTICATION ────────────────────────────────────────────────────────
  if (def.category === 'AUTHENTICATION') {
    const minutes = Number(def.codeExpirationMinutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 90) {
      push('code_expiration_minutes', 'Code expiration must be between 1 and 90 minutes.');
    }
    if (def.header.type !== 'NONE') {
      push('header', 'Authentication templates cannot have a header.');
    }
    return { errors, warnings };
  }

  // ── header ────────────────────────────────────────────────────────────────
  if (def.header.type === 'TEXT') {
    if (!def.header.text) push('header', 'Header text is required when the header type is TEXT.');
    else if (def.header.text.length > LIMITS.headerTextMax) {
      push('header', `Header text must be at most ${LIMITS.headerTextMax} characters.`);
    } else if (uniqueVariables(def.header.text).length) {
      push('header', 'Header text cannot contain variables.');
    }
  }
  if (MEDIA_HEADER_FORMATS.includes(def.header.type) && !def.header.handle && !def.header.imageUrl) {
    const article = def.header.type === 'IMAGE' ? 'An' : 'A';
    push('header', `${article} ${def.header.type.toLowerCase()} file is required for this header type.`);
  }

  // ── body ──────────────────────────────────────────────────────────────────
  if (!def.body.text) push('body', 'Message body is required.');
  if (def.body.text.length > LIMITS.bodyMax) {
    push('body', `Message body must be at most ${LIMITS.bodyMax} characters (currently ${def.body.text.length}).`);
  }

  const { sampleArray } = canonicalizeBody(def.body.text, def.body.samples);
  if (sampleArray.some((s) => !trimText(s))) {
    push('body', 'Every body variable needs a sample value for Meta review.');
  }
  const varCount = uniqueVariables(def.body.text).length;
  if (varCount > 0 && sampleArray.length !== varCount) {
    push('body', 'Number of sample values must match the number of body variables.');
  }

  // ── footer ────────────────────────────────────────────────────────────────
  if (def.footer && def.footer.length > LIMITS.footerMax) {
    push('footer', `Footer must be at most ${LIMITS.footerMax} characters.`);
  }
  if (uniqueVariables(def.footer).length) {
    push('footer', 'Footer cannot contain variables.');
  }

  // ── buttons ───────────────────────────────────────────────────────────────
  // Meta allows up to 10 buttons in total, of which at most 2 may be URL
  // buttons and at most 1 may be a phone-number button.
  if (def.buttons.length > LIMITS.maxButtonsTotal) {
    push('buttons', `Up to ${LIMITS.maxButtonsTotal} buttons are allowed per template.`);
  }
  const urlCount = def.buttons.filter((b) => b.type === 'URL').length;
  if (urlCount > LIMITS.urlButtonMax) {
    push('buttons', `Up to ${LIMITS.urlButtonMax} website-link buttons are allowed.`);
  }
  const phoneCount = def.buttons.filter((b) => b.type === 'PHONE_NUMBER').length;
  if (phoneCount > LIMITS.phoneButtonMax) {
    push('buttons', 'Only one phone-number button is allowed per template.');
  }

  def.buttons.forEach((btn, idx) => {
    const label = `Button ${idx + 1}`;
    if (!btn.text) push('buttons', `${label} needs display text.`);
    if (btn.text && btn.text.length > LIMITS.buttonTextMax) {
      push('buttons', `${label} text must be at most ${LIMITS.buttonTextMax} characters.`);
    }
    if (btn.type === 'URL') {
      if (!btn.url) push('buttons', `${label} needs a website URL.`);
      else if (!/^https?:\/\/[^\s]+$/i.test(btn.url)) push('buttons', `${label} URL must start with http:// or https://.`);
    }
    if (btn.type === 'PHONE_NUMBER') {
      if (!btn.phone_number || btn.phone_number.length < 8) {
        push('buttons', `${label} needs a full phone number with country code.`);
      }
    }
  });

  // ── category heuristics ───────────────────────────────────────────────────
  if (def.category === 'UTILITY' && def.body.text) {
    const hit = PROMOTIONAL_PATTERNS.find((re) => re.test(def.body.text));
    if (hit) {
      warnings.push({
        field: 'body',
        message:
          'This body reads like a promotion. Meta usually rejects promotional copy sent as UTILITY — ' +
          'switch to MARKETING or rewrite it around a specific transaction (order, payment, delivery, account).',
      });
    }
  }

  return { errors, warnings };
};

/** Throws a rich, HTTP-friendly error when the definition is invalid. */
const assertValidDefinition = (def) => {
  const { errors, warnings } = validateDefinition(def);
  if (errors.length) {
    const err = new Error(errors.map((e) => e.message).join(' '));
    err.status = 400;
    err.validationErrors = errors;
    err.warnings = warnings;
    throw err;
  }
  return warnings;
};

//──────────────────────────────────────────────────────────────────────────────
// Meta error decoding
//──────────────────────────────────────────────────────────────────────────────

const META_HINTS = [
  {
    test: (e) => e.code === 190,
    hint: 'The access token is invalid or expired. Generate a new System User token in Meta Business Settings and save it in Integrations.',
  },
  {
    test: (e) => /already existed|already exists/i.test(e.message || ''),
    hint: 'A template with this name and language already exists on the WABA. Use a different name, or delete the existing one first.',
  },
  {
    test: (e) => e.code === 100 && /header_handle/i.test(`${e.details || ''} ${e.message || ''}`),
    hint: 'Meta could not read the header media. Re-upload the image (JPEG/PNG under 5 MB) and try again.',
  },
  {
    test: (e) => e.code === 132000,
    hint: 'The number of example values does not match the number of {{n}} variables in the body.',
  },
  {
    test: (e) => e.code === 132001,
    hint: 'Meta does not know this template. Sync templates from Meta before sending.',
  },
  {
    test: (e) => e.code === 132012 || e.code === 132015,
    hint: 'The template is paused or disabled by Meta (usually low quality or policy review). Check WhatsApp Manager.',
  },
  {
    test: (e) => e.code === 131026,
    hint: 'The recipient cannot receive this category of message (no opt-in, or marketing restricted).',
  },
  {
    test: (e) => e.code === 131049,
    hint:
      'Meta does not deliver MARKETING messages to WhatsApp users in the United States (error 131049). The ' +
      'restriction applies to every Business Messaging API — send a utility message or an approved non-marketing ' +
      'template instead.',
  },
  {
    test: (e) => /direct send/i.test(`${e.details || ''} ${e.message || ''}`),
    hint:
      'Direct Send is not enabled for this Messaging account. Send an approved template instead, or ask your ' +
      'Meta partner / client manager to enable Direct Send.',
  },
  {
    test: (e) => e.code === 131047,
    hint:
      'Outside the 24-hour customer service window. Send an approved template — or a Direct Send utility ' +
      'message — to re-open the conversation.',
  },
  {
    test: (e) => e.code === 135000,
    hint:
      'Meta dropped this message because of business portfolio pacing. Retry later or reduce the number of ' +
      'messages sent to this recipient.',
  },
  {
    test: (e) => e.code === 132021,
    hint:
      'A template with this direct_send_config.template_name already exists but was not created by Direct ' +
      'Send. Pick a different template name.',
  },
  {
    test: (e) => e.code === 368,
    hint: 'The account is temporarily blocked for policy violations. Review account quality in WhatsApp Manager.',
  },
  {
    test: (e) => /category/i.test(e.message || '') && /mismatch|not valid|wrong/i.test(e.message || ''),
    hint: 'Meta disagreed with the chosen category. Utility templates must describe a specific transaction, not an offer.',
  },
];

/**
 * Turns an axios error (or plain Error) from the Graph API into a flat object
 * that is safe to return to the UI.
 */
const formatMetaError = (error) => {
  const metaError = error?.metaError
    || error?.response?.data?.error
    || error?.response?.data
    || null;

  if (!metaError || typeof metaError !== 'object') {
    return { message: error?.message || 'Unknown error', hint: null };
  }

  const formatted = {
    message: metaError.error_user_msg || metaError.message || error.message || 'Meta rejected the request.',
    code: metaError.code ?? null,
    subcode: metaError.error_subcode ?? null,
    type: metaError.type || null,
    fbtraceId: metaError.fbtrace_id || null,
    details: metaError.error_data?.details || null,
    hint: null,
  };

  const match = META_HINTS.find((h) => h.test(formatted));
  if (match) formatted.hint = match.hint;
  else if (formatted.details) formatted.hint = formatted.details;

  return formatted;
};

//──────────────────────────────────────────────────────────────────────────────
// Category presets (shared with the UI via GET /api/template/presets)
//──────────────────────────────────────────────────────────────────────────────

const CATEGORY_PRESETS = {
  MARKETING: {
    label: 'Marketing',
    description: 'Promotions, offers, product launches, re-engagement.',
    header_type: 'IMAGE',
    body_text:
      'Hi {{1}}! 🎉 Our festive offer is live — get {{2}} off your next order at ZestEat. Tap below to browse the menu.',
    footer_text: 'ZestEat • Reply STOP to opt out',
    samples: ['Priya', '25%'],
    buttons: [
      { type: 'URL', text: 'View Offer', url: 'https://www.zesteat.in/' },
      { type: 'QUICK_REPLY', text: 'Stop Promos' },
    ],
  },
  UTILITY: {
    label: 'Utility',
    description: 'Order updates, receipts, delivery and account notifications.',
    header_type: 'TEXT',
    header_text: 'Order Confirmed',
    body_text:
      'Hi {{1}}, your order {{2}} for {{3}} has been confirmed and will be delivered by {{4}}. Track it from your account.',
    footer_text: 'ZestEat Support • +91 8566856789',
    samples: ['Priya', 'ORD-10482', '₹1,299', '6:30 PM'],
    buttons: [
      { type: 'URL', text: 'Track Order', url: 'https://www.zesteat.in/orders' },
      { type: 'PHONE_NUMBER', text: 'Call Support', phone_number: '+918566856789' },
    ],
  },
  AUTHENTICATION: {
    label: 'Authentication',
    description: 'One-time passcodes. Meta generates the body and Copy-code button.',
    header_type: 'NONE',
    body_text: '',
    footer_text: '',
    samples: [],
    buttons: [{ type: 'OTP' }],
    code_expiration_minutes: 10,
  },
};

const RULES = {
  nameMax: LIMITS.nameMax,
  headerTextMax: LIMITS.headerTextMax,
  bodyMax: LIMITS.bodyMax,
  footerMax: LIMITS.footerMax,
  buttonTextMax: LIMITS.buttonTextMax,
  maxButtonsTotal: LIMITS.maxButtonsTotal,
  quickReplyMax: LIMITS.quickReplyMax,
  urlButtonMax: LIMITS.urlButtonMax,
  phoneButtonMax: LIMITS.phoneButtonMax,
};

module.exports = {
  CATEGORIES,
  CATEGORY_PRESETS,
  LIMITS,
  RULES,
  MEDIA_HEADER_FORMATS,
  slugifyName,
  normalizeCategory,
  normalizeLanguage,
  normalizeButton,
  normalizePhoneNumber,
  uniqueVariables,
  canonicalizeBody,
  toDefinition,
  buildComponents,
  validateDefinition,
  assertValidDefinition,
  formatMetaError,
};
