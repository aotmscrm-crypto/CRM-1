const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { getMetaCredentials } = require('./metaConfigHelper');

const getMetaConfig = async () => {
  const creds = await getMetaCredentials();
  
  if (!creds.token || !creds.wabaId) {
    throw new Error('Missing Meta WABA ID or Access Token in settings');
  }
  
  return {
    creds,
    url: `https://graph.facebook.com/${creds.version}/${creds.wabaId}/message_templates`,
    headers: {
      'Authorization': `Bearer ${creds.token}`,
      'Content-Type': 'application/json'
    }
  };
};

function autoFixBodyVariables(text, existingSamples = []) {
  if (!text) return { text: text, sampleArray: [] };
  
  // Match {{ 1 }}, {{name}}, {{1}}, {{ customer_name }}
  const matches = text.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
  if (!matches || matches.length === 0) {
    return { text: text, sampleArray: [] };
  }

  // Assign sequential index to unique variables
  const varMap = new Map();
  let counter = 1;
  matches.forEach(m => {
    const rawKey = m.replace(/[\{\}\s]/g, '');
    if (!varMap.has(rawKey)) {
      varMap.set(rawKey, counter++);
    }
  });

  // Replace text with {{1}}, {{2}}, etc.
  let fixedText = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, p1) => {
    const rawKey = p1.trim();
    const seqNum = varMap.get(rawKey);
    return '{{' + seqNum + '}}';
  });

  // Meta rule: Body cannot START or END with a variable {{1}}
  if (fixedText.trim().startsWith('{{')) {
    fixedText = 'Hello ' + fixedText.trim();
  }
  if (fixedText.trim().endsWith('}}')) {
    fixedText = fixedText.trim() + ' • AOTMS';
  }

  // Generate valid sample array matching variable count
  const sampleArray = Array.from(varMap.keys()).map((key, idx) => {
    if (existingSamples[idx] && String(existingSamples[idx]).trim()) {
      return String(existingSamples[idx]).trim();
    }
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('name')) return 'Customer Name';
    if (lowerKey.includes('code') || lowerKey.includes('offer')) return 'AOTMS50';
    if (lowerKey.includes('amount') || lowerKey.includes('price')) return '999';
    return 'Sample_' + (idx + 1);
  });

  return { text: fixedText, sampleArray };
}

const sanitizeComponentsForMeta = (components) => {
  return (components || []).map(c => {
    if (c.type === 'BODY' && c.text) {
      const existingSamples = c.example && c.example.body_text && c.example.body_text[0] ? c.example.body_text[0] : [];
      const fixed = autoFixBodyVariables(c.text, existingSamples);
      
      if (fixed.sampleArray && fixed.sampleArray.length > 0) {
        return {
          ...c,
          text: fixed.text,
          example: { body_text: [fixed.sampleArray] }
        };
      } else {
        const cleaned = { ...c, text: fixed.text };
        delete cleaned.example;
        return cleaned;
      }
    }
    
    if (c.type === 'BUTTONS' && Array.isArray(c.buttons)) {
      const sanitizedButtons = c.buttons.slice(0, 3).map(b => {
        const btnText = (b.text || 'Button').trim().slice(0, 25);
        if (b.type === 'PHONE_NUMBER') {
          let phone = String(b.phone_number || '+918566856789').replace(/[^\d+]/g, '');
          if (!phone.startsWith('+')) phone = '+' + phone;
          if (phone.length < 5) phone = '+918566856789';
          return { type: 'PHONE_NUMBER', text: btnText, phone_number: phone };
        }
        if (b.type === 'URL') {
          let url = (b.url || 'https://www.zesteat.in/').trim();
          if (!url.startsWith('http')) url = 'https://' + url;
          return { type: 'URL', text: btnText, url };
        }
        return { type: 'QUICK_REPLY', text: btnText };
      });
      return { ...c, buttons: sanitizedButtons };
    }
    
    return c;
  });
};

const createTemplateOnMeta = async (name, language, category, components) => {
  const config = await getMetaConfig();
  const processedComponents = sanitizeComponentsForMeta(components);

  const payload = {
    name,
    language,
    category,
    components: processedComponents
  };

  try {
    const response = await axios.post(config.url, payload, { headers: config.headers });
    return response.data; 
  } catch (error) {
    const errData = error.response?.data?.error;
    const errorMsg = errData?.message || error.message || 'Unknown Meta Template Error';
    console.error('❌ [WA] Meta Template Creation Error:', JSON.stringify(errData || error.message, null, 2));
    const err = new Error(errorMsg);
    err.metaError = errData;
    throw err;
  }
};

const fetchAllTemplatesFromMeta = async () => {
  const config = await getMetaConfig();
  try {
    const response = await axios.get(config.url, {
      headers: config.headers,
      params: { limit: 100, fields: 'id,name,status,category,language,components' }
    });
    return response.data?.data || [];
  } catch (error) {
    const errData = error.response?.data?.error;
    const errorMsg = errData?.message || error.message || 'Failed to fetch Meta templates';
    console.error('❌ [WA] Meta Fetch All Templates Error:', JSON.stringify(errData || error.message, null, 2));
    const err = new Error(errorMsg);
    err.metaError = errData;
    throw err;
  }
};

const getTemplateStatusFromMeta = async (templateId) => {
    const config = await getMetaConfig();
    try {
        const response = await axios.get(`https://graph.facebook.com/${config.creds.version}/${templateId}`, { headers: config.headers });
        return response.data;
    } catch (error) {
        console.error('❌ [WA] Meta Template Status Error:', error.response?.data || error.message);
        throw error;
    }
};

const uploadMediaToMeta = async (filePath, mimeType, size) => {
  const creds = await getMetaCredentials();
  if (!creds.token) throw new Error('Missing Meta Access Token in settings');

  try {
    // 1. Create upload session
    const sessionRes = await axios.post(`https://graph.facebook.com/${creds.version}/app/uploads`, null, {
      params: { file_length: size, file_type: mimeType },
      headers: { Authorization: `Bearer ${creds.token}` }
    });
    
    const sessionId = sessionRes.data.id;
    if (!sessionId) throw new Error('Failed to create upload session');

    // 2. Upload file
    const fileStream = fs.createReadStream(filePath);
    const uploadRes = await axios.post(`https://graph.facebook.com/${creds.version}/${sessionId}`, fileStream, {
      headers: {
        Authorization: `OAuth ${creds.token}`,
        file_offset: 0
      }
    });

    return uploadRes.data.h; // The handle
  } catch (error) {
    console.error('❌ [WA] Meta Resumable Upload Error:', error.response?.data || error.message);
    throw error;
  }
};

const uploadMediaForSending = async (filePath, mimeType) => {
  const creds = await getMetaCredentials();
  if (!creds.token || !creds.phoneId) throw new Error('Missing Meta Access Token or Phone ID in settings');

  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', fs.createReadStream(filePath), { contentType: mimeType });

    const url = `https://graph.facebook.com/${creds.version}/${creds.phoneId}/media`;
    
    const response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${creds.token}`
      }
    });
    
    return response.data.id;
  } catch (error) {
    console.error('❌ [WA] Meta Media Upload Error:', error.response?.data || error.message);
    throw error;
  }
};

module.exports = {
  createTemplateOnMeta,
  getTemplateStatusFromMeta,
  uploadMediaToMeta,
  uploadMediaForSending,
  fetchAllTemplatesFromMeta
};
