const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const Contact = require('../models/Contact');
const path    = require('path');
const fs      = require('fs');
const { sendTextMessage, sendDirectSendMessage } = require('../utils/whatsappService');

const upload = multer({ dest: path.join(__dirname, '../uploads/') });

// Upload Excel
router.post('/upload-excel', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  try {
    const workbook  = XLSX.readFile(req.file.path);
    const sheet     = workbook.Sheets[workbook.SheetNames[0]];
    const data      = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (!data.length) { fs.unlinkSync(req.file.path); return res.json({ success: true, contacts: [], count: 0 }); }

    const headers  = (data[0] || []).map(h => String(h || '').trim().toLowerCase());
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('number') || h.includes('contact'));
    const nameIdx  = headers.findIndex(h => h.includes('name') || h.includes('customer') || h.includes('person'));
    const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('mail'));

    const contacts = []; const seenPhones = new Set();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || !row.length) continue;
      let phone = '', name = '', email = '';
      if (phoneIdx !== -1 && row[phoneIdx] !== undefined) {
        const raw = String(row[phoneIdx]).replace(/\D/g, '').replace(/^91/, '');
        if (raw.length === 10 && ['6','7','8','9'].includes(raw[0])) phone = raw;
      }
      if (!phone) {
        for (let j = 0; j < row.length; j++) {
          const val = String(row[j] || '').replace(/\D/g, '').replace(/^91/, '');
          if (val.length === 10 && ['6','7','8','9'].includes(val[0])) { phone = val; break; }
        }
      }
      if (!phone || seenPhones.has(phone)) continue;
      seenPhones.add(phone);
      if (nameIdx  !== -1 && row[nameIdx]  !== undefined) name  = String(row[nameIdx]).trim();
      if (emailIdx !== -1 && row[emailIdx] !== undefined) email = String(row[emailIdx]).trim();
      contacts.push({ phone, name, email });
    }
    fs.unlinkSync(req.file.path);
    res.json({ success: true, contacts, count: contacts.length });
  } catch (err) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/contacts - Create single contact
router.post('/', async (req, res) => {
  const { name, phone, email, address, source, segment, identity } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required' });

  let cleanP = String(phone).replace(/\D/g, '');
  if (cleanP.startsWith('91') && cleanP.length === 12) cleanP = cleanP.slice(2);

  const customIdentity = (identity && String(identity).trim()) ? String(identity).trim() : 'SAP FICO';

  try {
    const contact = await Contact.findOneAndUpdate(
      { phone: cleanP },
      {
        phone: cleanP,
        name: name ? name.trim() : '',
        email: email ? email.trim() : '',
        address: address ? address.trim() : '',
        source: source || 'manual',
        segment: segment || 'new',
        identity: customIdentity
      },
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true, contact, message: 'Contact saved successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Save bulk contacts
router.post('/save', async (req, res) => {
  const { contacts, phones, source = 'manual' } = req.body;
  let added = 0, skipped = 0;
  if (contacts && Array.isArray(contacts)) {
    for (const c of contacts) {
      try {
        if (!c.phone) continue;
        let cleanP = String(c.phone).replace(/\D/g, '');
        if (cleanP.startsWith('91') && cleanP.length === 12) cleanP = cleanP.slice(2);
        const contactIdentity = (c.identity && String(c.identity).trim()) ? String(c.identity).trim() : 'SAP FICO';
        await Contact.findOneAndUpdate(
          { phone: cleanP }, 
          { 
            phone: cleanP, 
            name: c.name ? String(c.name).trim() : '', 
            email: c.email ? String(c.email).trim() : '', 
            identity: contactIdentity, 
            source 
          }, 
          { upsert: true, new: true }
        );
        added++;
      } catch { skipped++; }
    }
  } else if (phones && Array.isArray(phones)) {
    for (const phone of phones) {
      try {
        let cleanP = String(phone).replace(/\D/g, '');
        if (cleanP.startsWith('91') && cleanP.length === 12) cleanP = cleanP.slice(2);
        await Contact.findOneAndUpdate({ phone: cleanP }, { phone: cleanP, identity: 'SAP FICO', source }, { upsert: true, new: true }); added++;
      }
      catch { skipped++; }
    }
  } else { return res.status(400).json({ success: false, message: 'No contacts or phones provided' }); }
  res.json({ success: true, added, skipped });
});

// POST /api/contacts/migrate-identity - Update existing General contacts to SAP FICO
router.post('/migrate-identity', async (req, res) => {
  const result = await Contact.updateMany(
    { $or: [{ identity: 'General' }, { identity: '' }, { identity: null }, { identity: { $exists: false } }] },
    { $set: { identity: 'SAP FICO' } }
  );
  res.json({ success: true, modifiedCount: result.modifiedCount, message: `Updated ${result.modifiedCount} existing contacts to SAP FICO identity.` });
});

// Get all contacts (with optional segment/optedOut filter)
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.segment)  filter.segment  = req.query.segment;
  if (req.query.optedOut !== undefined) filter.optedOut = req.query.optedOut === 'true';
  const contacts = await Contact.find(filter).sort('-createdAt');
  res.json({ success: true, contacts });
});

// Update contact
router.put('/:id', async (req, res) => {
  const { name, phone, email, address, segment, identity } = req.body;
  const updateData = {};
  if (name !== undefined) updateData.name = name.trim();
  if (phone) {
    let cleanP = String(phone).replace(/\D/g, '');
    if (cleanP.startsWith('91') && cleanP.length === 12) cleanP = cleanP.slice(2);
    updateData.phone = cleanP;
  }
  if (email !== undefined) updateData.email = email.trim();
  if (address !== undefined) updateData.address = address.trim();
  if (segment) updateData.segment = segment;
  if (identity !== undefined) {
    updateData.identity = (identity && String(identity).trim()) ? String(identity).trim() : 'SAP FICO';
  }

  const contact = await Contact.findByIdAndUpdate(req.params.id, updateData, { new: true });
  if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
  res.json({ success: true, contact, message: 'Contact updated successfully' });
});

// Delete contact
router.delete('/:id', async (req, res) => {
  await Contact.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Persists an outbound message so the Live Chat view keeps it after a refetch.
const logOutbound = async (phone, message, metaRes) => {
  const wamid = metaRes?.messages?.[0]?.id || `direct_${Date.now()}`;

  let cleanP = String(phone).replace(/\D/g, '');
  if (cleanP.startsWith('91') && cleanP.length === 12) cleanP = cleanP.slice(2);

  try {
    const MessageLog = require('../models/MessageLog');
    await MessageLog.findOneAndUpdate(
      { wamid },
      {
        $set: {
          wamid,
          phone: cleanP,
          direction: 'OUTGOING',
          status: 'sent',
          text: message,
          timestamp: new Date()
        }
      },
      { upsert: true, new: true }
    );
  } catch (logErr) {
    console.error('Failed to log outbound direct message to MessageLog:', logErr);
  }

  return wamid;
};

// Send manual WhatsApp message
// POST /api/contacts/send-message  { phone, message }
router.post('/send-message', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ success: false, message: 'phone and message required' });
  try {
    const metaRes = await sendTextMessage(phone, message);
    await logOutbound(phone, message, metaRes);
    res.json({ success: true, message: 'Message sent!', metaRes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Business-initiated message without an approved template (Meta Direct Send).
// POST /api/contacts/send-direct
//   { phone, message, category, templateName, ttlSeconds, header, buttons }
router.post('/send-direct', async (req, res) => {
  const { phone, message, category, templateName, ttlSeconds, header, buttons } = req.body || {};
  if (!phone || !String(message || '').trim()) {
    return res.status(400).json({ success: false, message: 'phone and message required' });
  }
  try {
    const metaRes = await sendDirectSendMessage(phone, message, {
      category,
      templateName,
      ttlSeconds: ttlSeconds === '' || ttlSeconds === undefined ? null : ttlSeconds,
      header: header || null,
      buttons: Array.isArray(buttons) ? buttons : [],
    });
    await logOutbound(phone, message, metaRes);
    res.json({
      success: true,
      message: 'Direct Send message accepted by Meta.',
      metaRes,
      warnings: metaRes?.directSendWarnings || [],
    });
  } catch (err) {
    const { formatMetaError } = require('../utils/templateBuilder');
    const metaError = formatMetaError(err);
    res.status(err.status || 400).json({
      success: false,
      message: metaError.message || err.message,
      metaError,
      validationErrors: err.validationErrors || [],
    });
  }
});

// Re-compute segments for all contacts
// POST /api/contacts/refresh-segments
router.post('/refresh-segments', async (req, res) => {
  const contacts = await Contact.find();
  let updated = 0;
  for (const c of contacts) {
    const prev = c.segment; c.refreshSegment();
    if (c.segment !== prev) { await c.save(); updated++; }
  }
  res.json({ success: true, updated });
});

// Opt-out contact
router.put('/:id/opt-out', async (req, res) => {
  const contact = await Contact.findByIdAndUpdate(req.params.id, { optedOut: true, optedOutAt: new Date() }, { new: true });
  res.json({ success: true, contact });
});

// Opt-in contact
router.put('/:id/opt-in', async (req, res) => {
  const contact = await Contact.findByIdAndUpdate(req.params.id, { optedOut: false, $unset: { optedOutAt: '' } }, { new: true });
  res.json({ success: true, contact });
});

module.exports = router;