import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Plus, 
  Search, 
  RotateCw, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Edit3, 
  ExternalLink, 
  Phone, 
  Image as ImageIcon, 
  ImageOff,
  FileText, 
  X, 
  Sparkles, 
  Check, 
  Eye, 
  ChevronRight,
  ChevronLeft,
  Send,
  UploadCloud,
  HelpCircle,
  Smartphone,
  UserCheck,
  Link2,
  FileUp,
  FolderOpen
} from 'lucide-react';
import { IoLogoWhatsapp as WhatsApp } from 'react-icons/io5';

import ConfirmModal from '../Components/ui/ConfirmModal';

// Helper function to render body text with live variable replacements
const renderPreviewBody = (text, sampleValues = []) => {
  if (!text) return '';
  let samples = [];
  if (Array.isArray(sampleValues)) {
    samples = sampleValues;
  } else if (typeof sampleValues === 'string' && sampleValues.trim()) {
    samples = sampleValues.split(',').map(s => s.trim());
  }

  let replaced = String(text);
  
  // Replace numbered variables {{1}}, {{2}}, {{3}}... with sample values if provided
  samples.forEach((val, idx) => {
    if (val !== undefined && val !== null && val !== '') {
      const regex = new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g');
      replaced = replaced.replace(regex, val);
    }
  });

  // Replace any remaining {{1}}, {{2}} or {{variable}} placeholders with sample or fallback text
  replaced = replaced.replace(/\{\{(\d+)\}\}/g, (match, p1) => {
    const num = parseInt(p1, 10) - 1;
    return samples[num] || `[Var ${p1}]`;
  });

  return replaced;
};

// Helper to clean and extract 10-digit phone number for indexing
const getCleanPhone10 = (p) => {
  if (!p) return '';
  const digits = String(p).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

// Helper to format date header label (Today, Yesterday, or Sep 9, 2026)
const getChatDateHeaderLabel = (dateObj) => {
  if (!dateObj) return 'Today';
  const d = new Date(dateObj);
  if (isNaN(d.getTime())) return 'Today';

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (d1, d2) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function WhatsappMessage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [brokenImages, setBrokenImages] = useState({});

  // View Mode: 'TEMPLATES' vs 'LIVE_CHAT' (WhatsApp Web dual-pane - Default to LIVE_CHAT)
  const [viewMode, setViewModeState] = useState(() => {
    return localStorage.getItem('wa_view_mode') || 'LIVE_CHAT';
  });

  const setViewMode = (mode) => {
    setViewModeState(mode);
    localStorage.setItem('wa_view_mode', mode);
  };

  const [contactsList, setContactsList] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [chatSearch, setChatSearch] = useState('');
  const [contactFilter, setContactFilter] = useState('ALL'); // ALL, SAP FICO, General, New
  const [chatMessageText, setChatMessageText] = useState('');
  const [selectedChatTemplate, setSelectedChatTemplate] = useState('');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [sendingChatMsg, setSendingChatMsg] = useState(false);
  const [chatLogMap, setChatLogMap] = useState({});
  const [unreadMap, setUnreadMap] = useState({}); // { [phone10]: count }
  const [lastSeenMap, setLastSeenMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('wa_read_timestamps') || '{}');
    } catch {
      return {};
    }
  });
  const [latestMsgTimeMap, setLatestMsgTimeMap] = useState({}); // { [phone10]: timestamp }
  const chatBottomRef = useRef(null);

  // Handle contact selection & automatically turn OFF unread badge
  const handleSelectContact = (c) => {
    setSelectedContact(c);
    if (c && c.phone) {
      const cleanP = String(c.phone).replace(/\D/g, '').slice(-10);

      const now = Date.now();
      setLastSeenMap(prev => {
        const updated = { ...prev, [cleanP]: now };
        localStorage.setItem('wa_read_timestamps', JSON.stringify(updated));
        return updated;
      });
      setUnreadMap(prev => ({ ...prev, [cleanP]: 0 }));
    }
  };

  // Modal & Preview state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [toastType, setToastType] = useState('success');

  // In-App Confirm Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'danger',
    confirmText: 'OK, Delete',
    cancelText: 'Cancel',
    onConfirm: null
  });

  const previewChatRef = useRef(null);
  const previewModalChatRef = useRef(null);
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingTemplateId, setEditingTemplateId] = useState(null);

  // Create Template Form State (Declared BEFORE useEffect)
  const [formData, setFormData] = useState({
    name: '',
    category: 'MARKETING',
    language: 'en',
    header_type: 'IMAGE', // 'NONE', 'TEXT', 'IMAGE'
    header_text: '',
    header_image_url: '',
    body_text: 'Welcome to AOTMS Enterprise Solutions. Claim your exclusive discount on all WhatsApp automation tools.',
    footer_text: 'AOTMS',
    buttons: [
      { type: 'PHONE_NUMBER', text: 'Call Support', phone_number: '+918019942233', url: '', contact_name: '' },
      { type: 'URL', text: 'Visit Website', phone_number: '', url: 'https://www.academyoftechmasters.com/', contact_name: '' }
    ]
  });

  const openCreateModal = () => {
    setEditingTemplateId(null);
    setSelectedFile(null);
    setFormData({
      name: '',
      category: 'MARKETING',
      language: 'en',
      header_type: 'IMAGE',
      header_text: '',
      header_image_url: '',
      body_text: 'Welcome to AOTMS Enterprise Solutions. Claim your exclusive discount on all WhatsApp automation tools.',
      footer_text: 'AOTMS',
      buttons: [
        { type: 'PHONE_NUMBER', text: 'Call Support', phone_number: '+918019942233', url: '', contact_name: '' },
        { type: 'URL', text: 'Visit Website', phone_number: '', url: 'https://www.academyoftechmasters.com/', contact_name: '' }
      ]
    });
    setShowCreateModal(true);
  };

  // Automatic smooth scroll behavior when content or buttons change
  useEffect(() => {
    if (previewChatRef.current) {
      const el = previewChatRef.current;
      setTimeout(() => {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: 'smooth'
        });
      }, 50);
    }
  }, [
    formData.buttons.length, 
    formData.body_text, 
    formData.header_image_url, 
    formData.header_text, 
    formData.header_type
  ]);

  // Scroll to top upon opening standalone preview
  useEffect(() => {
    if (previewTemplate && previewModalChatRef.current) {
      setTimeout(() => {
        previewModalChatRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 80);
    }
  }, [previewTemplate]);

  const getApiBase = () => {
    if (import.meta.env.VITE_API_BASE_URL) {
      return import.meta.env.VITE_API_BASE_URL;
    }
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return 'http://localhost:5000';
    }
    return 'https://crm-1-62pl.onrender.com';
  };

  const showToast = (msg, type = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const [syncingMeta, setSyncingMeta] = useState(false);

  const mapTemplateFromDb = (t) => {
    const bodyComp = Array.isArray(t.components) ? t.components.find(c => c.type === 'BODY') : null;
    const footerComp = Array.isArray(t.components) ? t.components.find(c => c.type === 'FOOTER') : null;
    const headerComp = Array.isArray(t.components) ? t.components.find(c => c.type === 'HEADER') : null;
    const buttonsComp = Array.isArray(t.components) ? t.components.find(c => c.type === 'BUTTONS') : null;

    let headerType = t.header_type || (t.imageUrl ? 'IMAGE' : (headerComp ? (headerComp.format || 'NONE') : 'NONE'));
    let headerText = t.header_text || (headerComp?.format === 'TEXT' ? (headerComp.text || '') : '');
    let headerImageUrl = t.imageUrl || t.header_image_url || (headerComp?.example?.header_handle?.[0] || '');
    if (headerImageUrl && typeof headerImageUrl === 'string' && headerImageUrl.startsWith('/uploads')) {
      headerImageUrl = `${getApiBase()}${headerImageUrl}`;
    }
    if (headerImageUrl && typeof headerImageUrl === 'string' && headerImageUrl.startsWith('4::')) {
      headerImageUrl = ''; // Internal Meta handle string, fallback to missing image state
    }
    let headerContent = headerImageUrl || headerText || t.header_content || '';
    let bodyText = t.message || bodyComp?.text || t.body_text || t.title || 'Welcome to AOTMS!';
    let footerText = t.footer || footerComp?.text || t.footer_text || '';

    let buttonsList = [];
    try {
      buttonsList = typeof t.buttons === 'string' ? JSON.parse(t.buttons) : (t.buttons || buttonsComp?.buttons || []);
    } catch (e) {
      buttonsList = buttonsComp?.buttons || [];
    }
    if ((!buttonsList || buttonsList.length === 0) && buttonsComp?.buttons) {
      buttonsList = buttonsComp.buttons;
    }

    return {
      _id: t._id,
      id: t.metaTemplateId || t._id,
      name: t.name || t.title || 'template',
      category: t.category || 'MARKETING',
      language: t.language || 'en',
      status: t.metaStatus || t.status || 'APPROVED',
      header_type: headerType,
      header_text: headerText,
      header_image_url: headerImageUrl,
      header_content: headerContent,
      body_text: bodyText,
      footer_text: footerText,
      buttons: buttonsList,
      meta_template_id: t.metaTemplateId || t._id
    };
  };

  // Initial mount useEffect to load templates & prevent infinite loading
  useEffect(() => {
    fetchTemplates();
  }, []);

  // Real-time API: Fetch templates directly from backend API
  const fetchTemplates = async () => {
    setLoading(true);
    setRefreshing(true);
    const endpoints = [
      `${getApiBase()}/api/integrations/whatsapp/templates`,
      `${getApiBase()}/api/template`,
      `${getApiBase()}/api/integrations/whatsapp/templates/meta`
    ];

    let success = false;
    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        if (res.status === 404) continue;
        const data = await res.json();
        if (res.ok && data && (data.success || Array.isArray(data.templates) || Array.isArray(data))) {
          const rawList = Array.isArray(data.templates) ? data.templates : (Array.isArray(data) ? data : []);
          const mapped = rawList.map(mapTemplateFromDb);
          setTemplates(mapped);
          success = true;
          break;
        }
      } catch (err) {
        console.error("Failed to fetch templates from API endpoint:", url, err);
      }
    }

    if (!success) {
      setTemplates([]);
    }
    setLoading(false);
    setRefreshing(false);
  };

  // Real-time API: Sync live templates from Meta WhatsApp Business Account
  const handleSyncMeta = async () => {
    setSyncingMeta(true);
    const syncEndpoints = [
      `${getApiBase()}/api/integrations/whatsapp/templates/sync`,
      `${getApiBase()}/api/integrations/whatsapp/templates/sync-meta`,
      `${getApiBase()}/api/template/sync`,
      `${getApiBase()}/api/template/sync-meta`
    ];

    let lastError = null;
    let successResult = null;

    for (const url of syncEndpoints) {
      try {
        const res = await fetch(url, { method: 'POST' });
        if (res.status === 404) continue;
        const data = await res.json();
        if (res.ok && data && data.success) {
          successResult = data;
          break;
        } else {
          lastError = new Error(data.message || data.detail || "Failed to sync templates from Meta.");
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (successResult && Array.isArray(successResult.templates)) {
      const mapped = successResult.templates.map(mapTemplateFromDb);
      setTemplates(mapped);
      showToast(`Real-time Sync: Fetched ${mapped.length} templates from Meta Account!`, "success");
    } else {
      showToast(lastError?.message || "Error syncing templates with Meta API", "error");
    }
    setSyncingMeta(false);
  };

  // Update Template Status live in MongoDB
  const handleUpdateStatus = async (tmpl, newStatus) => {
    const targetId = tmpl._id || tmpl.id || tmpl.name;
    try {
      const res = await fetch(`${getApiBase()}/api/integrations/whatsapp/templates/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metaStatus: newStatus, status: newStatus.toLowerCase() })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        showToast(`Template '${tmpl.name}' status updated to ${newStatus}!`, "success");
        await fetchTemplates();
      } else {
        throw new Error(result.message || "Failed to update status.");
      }
    } catch (err) {
      showToast(err.message || "Error updating template status.", "error");
    }
  };

  // Fetch contacts for Live WhatsApp Chat Mode
  const fetchContactsList = async () => {
    setLoadingContacts(true);
    try {
      const res = await fetch(`${getApiBase()}/api/contacts`);
      const data = await res.json();
      if (res.ok && data && data.success && Array.isArray(data.contacts)) {
        setContactsList(data.contacts);
        if (!selectedContact && data.contacts.length > 0) {
          setSelectedContact(data.contacts[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch contacts for WhatsApp Chat:", err);
    } finally {
      setLoadingContacts(false);
    }
  };

  // Real-time Chat Logs Fetcher for Selected Contact
  const fetchChatLogs = async (phone) => {
    if (!phone) return;
    const cleanKey = getCleanPhone10(phone);
    try {
      const res = await fetch(`${getApiBase()}/api/whatsapp/messages?phone=${phone}`);
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.logs)) {
        const formatted = data.logs.map(log => {
          const isIncoming = log.direction === 'INCOMING' || log.status === 'received';
          const timestampDate = log.timestamp ? new Date(log.timestamp) : new Date();

          let parsedButtons = [];
          try {
            parsedButtons = typeof log.buttons === 'string' ? JSON.parse(log.buttons) : (log.buttons || []);
          } catch (e) {
            parsedButtons = [];
          }

          let displayText = (log.text || '').trim();
          if (!displayText || displayText === 'Sent Message') {
            if (log.templateName) {
              displayText = `Template Message (${log.templateName})`;
            } else if (parsedButtons.length > 0) {
              displayText = `Interactive Template Message`;
            } else if (log.headerImageUrl) {
              displayText = `Template Message with Media`;
            } else {
              displayText = isIncoming ? 'Incoming message' : 'WhatsApp Template Message';
            }
          }

          return {
            id: log.wamid || log._id,
            type: isIncoming ? 'INCOMING' : (log.templateName ? 'OUTGOING_TEMPLATE' : 'OUTGOING'),
            text: displayText,
            senderName: log.senderName || (isIncoming ? 'Customer' : 'Business'),
            templateName: log.templateName || '',
            header_image_url: log.headerImageUrl || '',
            buttons: parsedButtons,
            rawTimestamp: timestampDate,
            time: timestampDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: log.status || 'sent', // sent, delivered, read, failed, received
            errorCode: log.errorCode,
            errorMessage: log.errorMessage
          };
        });

        setChatLogMap(prev => ({
          ...prev,
          [cleanKey]: formatted
        }));
      }
    } catch (err) {
      // silent polling error catch
    }
  };

  // Fetch unread incoming message counts & latest activity timestamps for contact sorting (Top position!)
  const fetchAllUnreadCounts = async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/whatsapp/messages`);
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.logs)) {
        const counts = {};
        const latestTimes = {};
        const currentActivePhone = selectedContact?.phone ? String(selectedContact.phone).replace(/\D/g, '').slice(-10) : '';

        let readStorage = {};
        try { readStorage = JSON.parse(localStorage.getItem('wa_read_timestamps') || '{}'); } catch {}

        data.logs.forEach(log => {
          if (log.phone) {
            const cleanP = String(log.phone).replace(/\D/g, '').slice(-10);
            const logTime = new Date(log.timestamp).getTime();
            latestTimes[cleanP] = Math.max(latestTimes[cleanP] || 0, logTime);

            const isIncoming = log.direction === 'INCOMING' || log.status === 'received' || (log.senderName && log.senderName !== 'Business');
            if (isIncoming) {
              const lastRead = readStorage[cleanP] || lastSeenMap[cleanP] || 0;
              if (cleanP !== currentActivePhone && logTime > lastRead) {
                counts[cleanP] = (counts[cleanP] || 0) + 1;
              }
            }
          }
        });

        setLatestMsgTimeMap(latestTimes);
        setUnreadMap(counts);
      }
    } catch (err) {
      // silent polling error catch
    }
  };

  // Real-time 3-second Polling Hook for Live Chat & Unread Badges
  useEffect(() => {
    if (viewMode === 'LIVE_CHAT') {
      fetchContactsList();
      if (selectedContact?.phone) {
        fetchChatLogs(selectedContact.phone);
      }
      fetchAllUnreadCounts();

      const pollInterval = setInterval(() => {
        if (selectedContact?.phone) {
          fetchChatLogs(selectedContact.phone);
        }
        fetchAllUnreadCounts();
      }, 3000);

      return () => clearInterval(pollInterval);
    }
  }, [viewMode, selectedContact?.phone, lastSeenMap]);

  // Scroll chat window to bottom ONLY when selecting a new contact or switching view mode (Auto-scroll turned OFF during background polling)
  useEffect(() => {
    if (viewMode === 'LIVE_CHAT' && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedContact?.phone, viewMode]);

  // Send Direct Text Message in Live WhatsApp Chat
  const handleSendDirectChatMessage = async (e) => {
    e.preventDefault();
    if (!selectedContact) {
      showToast("Please select a contact from the left list.", "error");
      return;
    }
    if (!chatMessageText.trim()) {
      showToast("Please enter a message to send.", "error");
      return;
    }

    const targetPhone = selectedContact.phone;
    const msgText = chatMessageText.trim();
    setSendingChatMsg(true);

    try {
      const res = await fetch(`${getApiBase()}/api/contacts/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: targetPhone, message: msgText })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Message sent to ${selectedContact.name || targetPhone}! 🎉`, "success");
        setChatMessageText('');

        // Optimistic UI Update: Display message on screen immediately!
        const cleanKey = getCleanPhone10(targetPhone);
        const now = new Date();
        const tempMsg = {
          id: `opt_${Date.now()}`,
          type: 'OUTGOING',
          text: msgText,
          senderName: 'Business',
          rawTimestamp: now,
          time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: 'sent'
        };
        setChatLogMap(prev => ({
          ...prev,
          [cleanKey]: [...(prev[cleanKey] || []), tempMsg]
        }));

        setTimeout(() => fetchChatLogs(targetPhone), 500);
      } else {
        throw new Error(data.message || "Failed to send message.");
      }
    } catch (err) {
      showToast(err.message || "Error sending WhatsApp message", "error");
    } finally {
      setSendingChatMsg(false);
    }
  };

  // Send Selected Approved Template in Live WhatsApp Chat
  const handleSendTemplateInChat = async (templateIdToSet) => {
    const tmplId = templateIdToSet || selectedChatTemplate;
    if (!selectedContact) {
      showToast("Please select a contact first.", "error");
      return;
    }
    if (!tmplId) {
      showToast("Please select an approved template to send.", "error");
      return;
    }

    const tmpl = templates.find(t => (t._id === tmplId || t.id === tmplId || t.metaTemplateId === tmplId || t.name === tmplId));
    const targetPhone = selectedContact.phone;
    setSendingChatMsg(true);

    try {
      const res = await fetch(`${getApiBase()}/api/template/send-meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: tmpl?._id || tmplId,
          phones: [targetPhone]
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Template '${tmpl?.name || 'Meta Template'}' sent to ${selectedContact.name || targetPhone}! 🎉`, "success");
        setSelectedChatTemplate('');

        let parsedButtons = [];
        try {
          parsedButtons = typeof tmpl?.buttons === 'string' ? JSON.parse(tmpl.buttons) : (tmpl?.buttons || []);
        } catch (e) {
          parsedButtons = [];
        }

        // Optimistic UI Update: Display rich template message on screen immediately!
        const cleanKey = getCleanPhone10(targetPhone);
        const now = new Date();
        const tempMsg = {
          id: `opt_tmpl_${Date.now()}`,
          type: 'OUTGOING_TEMPLATE',
          text: tmpl?.body_text || tmpl?.message || 'Template Message Sent',
          templateName: tmpl?.name || 'Meta Template',
          header_image_url: tmpl?.header_image_url || tmpl?.imageUrl || '',
          buttons: parsedButtons,
          senderName: 'Business',
          rawTimestamp: now,
          time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: 'sent'
        };
        setChatLogMap(prev => ({
          ...prev,
          [cleanKey]: [...(prev[cleanKey] || []), tempMsg]
        }));

        setTimeout(() => fetchChatLogs(targetPhone), 1000);
      } else {
        throw new Error(data.message || "Failed to send template.");
      }
    } catch (err) {
      showToast(err.message || "Error sending template message", "error");
    } finally {
      setSendingChatMsg(false);
    }
  };

  // Handle image upload from file picker
  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast("Please select a valid image file (PNG, JPG, JPEG, WEBP).", "error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast("Image size must be less than 5MB.", "error");
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData(prev => ({
        ...prev,
        header_image_url: event.target.result
      }));
      showToast(`Image "${file.name}" selected!`, "success");
    };
    reader.readAsDataURL(file);
  };

  // Build Meta Components array from formData
  const buildMetaComponents = (data) => {
    const components = [];
    if (data.header_type === 'TEXT' && data.header_text) {
      components.push({ type: 'HEADER', format: 'TEXT', text: data.header_text });
    } else if (data.header_type === 'IMAGE' && (selectedFile || data.header_image_url)) {
      components.push({ type: 'HEADER', format: 'IMAGE' });
    }
    const bodyComp = { type: 'BODY', text: data.body_text || 'Welcome to AOTMS!' };
    components.push(bodyComp);
    if (data.footer_text) {
      components.push({ type: 'FOOTER', text: data.footer_text });
    }
    if (Array.isArray(data.buttons) && data.buttons.length > 0) {
      const formattedBtns = data.buttons.map(b => {
        if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
        if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
        return { type: 'QUICK_REPLY', text: b.text || 'Reply' };
      });
      components.push({ type: 'BUTTONS', buttons: formattedBtns });
    }
    return components;
  };

  // Real-time API: Create or Update template directly via API
  const handleCreateTemplate = async (e) => {
    e.preventDefault();

    const formattedName = formData.name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
    if (!formattedName) {
      showToast("Please enter a valid template name (lowercase + underscores).", "error");
      return;
    }

    if (formData.header_type === 'IMAGE' && !selectedFile && !formData.header_image_url) {
      showToast("Please select an Image file for your Header Image template.", "error");
      return;
    }

    setSubmitting(true);
    const components = buildMetaComponents(formData);

    const endpoints = editingTemplateId
      ? [
          `${getApiBase()}/api/integrations/whatsapp/templates/${editingTemplateId}`,
          `${getApiBase()}/api/template/${editingTemplateId}`
        ]
      : [
          `${getApiBase()}/api/integrations/whatsapp/templates/meta`,
          `${getApiBase()}/api/integrations/whatsapp/templates`,
          `${getApiBase()}/api/template/meta`,
          `${getApiBase()}/api/template`
        ];

    let lastError = null;
    let successResult = null;

    for (const url of endpoints) {
      try {
        let options;
        const httpMethod = editingTemplateId ? 'PUT' : 'POST';
        if (selectedFile) {
          const bodyData = new FormData();
          bodyData.append('media', selectedFile);
          bodyData.append('name', formattedName);
          bodyData.append('category', formData.category || 'MARKETING');
          bodyData.append('language', formData.language || 'en');
          bodyData.append('header_type', formData.header_type || 'IMAGE');
          bodyData.append('header_text', formData.header_text || '');
          bodyData.append('body_text', formData.body_text || '');
          bodyData.append('footer_text', formData.footer_text || '');
          bodyData.append('message', formData.body_text || '');
          bodyData.append('components', JSON.stringify(components));
          options = {
            method: httpMethod,
            body: bodyData
          };
        } else {
          options = {
            method: httpMethod,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...formData, message: formData.body_text, name: formattedName, components })
          };
        }

        const res = await fetch(url, options);

        if (res.status === 404) {
          continue;
        }

        const result = await res.json();
        if (res.ok && (result.success || result.template)) {
          successResult = result;
          break;
        } else {
          lastError = new Error(result.message || result.detail || "Failed to process template on Meta Cloud API.");
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (successResult) {
      const actionText = editingTemplateId ? 'updated' : 'created';
      showToast(successResult.message || `Template '${formattedName}' ${actionText} successfully on Meta!`, "success");
      setShowCreateModal(false);
      setSelectedFile(null);
      setEditingTemplateId(null);
      await fetchTemplates();
    } else {
      showToast(lastError?.message || "Failed to save template on API", "error");
    }

    setSubmitting(false);
  };

  // Delete Template directly via API
  const handleDeleteTemplate = (tmpl) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete WhatsApp Template",
      message: `Are you sure you want to delete template '${tmpl.name}'? This action cannot be undone.`,
      type: "danger",
      confirmText: "OK, Delete Template",
      cancelText: "Cancel",
      onConfirm: () => executeDeleteTemplate(tmpl)
    });
  };

  const executeDeleteTemplate = async (tmpl) => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    const targetId = tmpl._id || tmpl.id || tmpl.name;

    try {
      const res = await fetch(`${getApiBase()}/api/integrations/whatsapp/templates/${targetId}`, {
        method: 'DELETE'
      });
      const result = await res.json();
      if (res.ok && result.success) {
        showToast(result.message || `Template '${tmpl.name}' deleted successfully from Meta & Database.`, "success");
        await fetchTemplates();
      } else {
        throw new Error(result.message || "Failed to delete template.");
      }
    } catch (err) {
      showToast(err.message || "Error deleting template from API", "error");
    }
  };

  const handleEditTemplate = (tmpl) => {
    let parsedButtons = [];
    try {
      parsedButtons = typeof tmpl.buttons === 'string' ? JSON.parse(tmpl.buttons) : (tmpl.buttons || []);
    } catch (e) {
      parsedButtons = [];
    }

    const headerComp = tmpl.components?.find(c => c.type === 'HEADER');
    const bodyComp = tmpl.components?.find(c => c.type === 'BODY');
    const footerComp = tmpl.components?.find(c => c.type === 'FOOTER');

    setEditingTemplateId(tmpl._id || tmpl.metaTemplateId || tmpl.name);
    setFormData({
      name: tmpl.name,
      category: tmpl.category || 'MARKETING',
      language: tmpl.language || 'en',
      header_type: headerComp ? headerComp.format : (tmpl.header_type || 'NONE'),
      header_text: headerComp?.text || tmpl.header_text || '',
      header_image_url: tmpl.imageUrl || tmpl.header_image_url || '',
      body_text: bodyComp?.text || tmpl.body_text || tmpl.message || '',
      footer_text: footerComp?.text || tmpl.footer_text || tmpl.footer || '',
      buttons: parsedButtons
    });
    setShowCreateModal(true);
  };

  // Button types configuration
  const buttonTypeOptions = [
    { type: 'PHONE_NUMBER', label: 'Call Phone Number', icon: Phone, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { type: 'WHATSAPP_CALL', label: 'Call on WhatsApp', icon: WhatsApp, color: 'text-emerald-700 bg-emerald-100/70 border-emerald-300' },
    { type: 'CONTACT', label: 'Share Contact Info', icon: UserCheck, color: 'text-amber-700 bg-amber-50 border-amber-200' },
    { type: 'CUSTOM', label: 'Custom', icon: Send, color: 'text-purple-700 bg-purple-50 border-purple-200' },
    { type: 'URL', label: 'Website Link', icon: ExternalLink, color: 'text-sky-700 bg-sky-50 border-sky-200' }
  ];

  const addButton = (type) => {
    if (formData.buttons.length >= 3) {
      showToast("Meta allows maximum 3 interactive buttons per message template.", "info");
      return;
    }

    let defaultText = 'Custom Reply';
    let defaultUrl = '';
    let defaultPhone = '+919876543210';
    let defaultContact = 'AOTMS Official';

    if (type === 'PHONE_NUMBER') defaultText = 'Call Phone Number';
    if (type === 'WHATSAPP_CALL') defaultText = 'Call on WhatsApp';
    if (type === 'CONTACT') defaultText = 'Share Contact Info';
    if (type === 'URL') { defaultText = 'Visit Website'; defaultUrl = 'https://aotms.com'; }
    if (type === 'CUSTOM') defaultText = 'Yes, I am Interested';

    setFormData(prev => ({
      ...prev,
      buttons: [...prev.buttons, {
        type: type,
        text: defaultText,
        url: defaultUrl,
        phone_number: defaultPhone,
        contact_name: defaultContact
      }]
    }));
  };

  const removeButton = (index) => {
    setFormData(prev => ({
      ...prev,
      buttons: prev.buttons.filter((_, i) => i !== index)
    }));
  };

  // Dynamic Template Category Filters (Show ALL categories without hiding any!)
  const rawCatList = Array.from(new Set(templates.map(t => (t.category || '').toUpperCase()).filter(Boolean)));
  ['MARKETING', 'UTILITY', 'AUTHENTICATION'].forEach(cat => {
    if (!rawCatList.includes(cat)) rawCatList.push(cat);
  });
  const availableTemplateCategories = ['ALL', ...rawCatList];

  // Dynamic Contact Segment / Identity Filters (Show ALL contact filters!)
  const rawContactCatList = Array.from(new Set(contactsList.flatMap(c => [c.identity, c.segment]).filter(Boolean)));
  ['SAP FICO', 'General', 'new'].forEach(cat => {
    if (!rawContactCatList.includes(cat)) rawContactCatList.push(cat);
  });
  const availableContactFilters = ['ALL', ...rawContactCatList];

  const filteredTemplates = templates.filter(tmpl => {
    const matchesCat = filterCategory === 'ALL' || (tmpl.category || '').toUpperCase() === filterCategory.toUpperCase();
    const query = searchQuery.toLowerCase();
    const matchesSearch = (tmpl.name || '').toLowerCase().includes(query) ||
                          (tmpl.body_text || '').toLowerCase().includes(query) ||
                          (tmpl.header_text || '').toLowerCase().includes(query);
    return matchesCat && matchesSearch;
  });


  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterCategory]);

  const totalPages = Math.ceil(filteredTemplates.length / ITEMS_PER_PAGE) || 1;
  const paginatedTemplates = filteredTemplates.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-md transition-all ${
          toastType === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-rose-50 text-rose-900 border-rose-200'
        }`}>
          <div className="flex items-center gap-3">
            <CheckCircle2 className={`w-5 h-5 ${toastType === 'success' ? 'text-emerald-600' : 'text-rose-600'}`} />
            <span className="text-xs font-extrabold">{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner Header */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-inner">
            <WhatsApp className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight">WhatsApp Template & Action Builder</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">Meta Cloud API</span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5 max-w-xl">
              Create, sync, and send Meta WhatsApp Cloud API approved templates with interactive action buttons.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Sync Meta Button */}
          <button
            type="button"
            onClick={handleSyncMeta}
            disabled={syncingMeta}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Sync Meta WhatsApp Account templates"
          >
            <RotateCw className={`w-3.5 h-3.5 ${syncingMeta ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{syncingMeta ? 'Syncing...' : 'Sync Meta API'}</span>
          </button>

          {/* Refresh Local */}
          <button
            type="button"
            onClick={fetchTemplates}
            disabled={refreshing}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* Create Template */}
          <button
            type="button"
            onClick={openCreateModal}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer hover:shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Create Template</span>
          </button>
        </div>
      </div>

      {/* Navigation View Switcher (Templates Studio vs Live WhatsApp Web Chat) */}
      <div className="flex items-center gap-3 p-1.5 rounded-2xl bg-slate-200/70 border border-slate-300/80 w-fit">
        <button
          type="button"
          onClick={() => setViewMode('TEMPLATES')}
          className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            viewMode === 'TEMPLATES'
              ? 'bg-slate-900 text-white shadow-md'
              : 'text-slate-700 hover:bg-white/70'
          }`}
        >
          <FileText className="w-4 h-4 text-emerald-400" />
          <span>Templates Studio</span>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-slate-800 text-slate-300">
            {templates.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('LIVE_CHAT')}
          className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
            viewMode === 'LIVE_CHAT'
              ? 'bg-emerald-700 text-white shadow-md ring-2 ring-emerald-500/30'
              : 'text-slate-700 hover:bg-white/70'
          }`}
        >
          <WhatsApp className="w-4.5 h-4.5 text-emerald-300" />
          <span>Live WhatsApp Web Chat</span>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold bg-emerald-950/80 text-emerald-200">
            Left Contacts • Right Chat
          </span>
        </button>
      </div>

      {/* VIEW MODE 1: LIVE WHATSAPP WEB CHAT (Left Contacts & Right Chat Window - White WhatsApp Theme) */}
      {viewMode === 'LIVE_CHAT' ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden min-h-[640px] flex flex-col md:flex-row text-slate-800">
          
          {/* LEFT PANEL: CONTACTS LIST (White WhatsApp Theme) */}
          <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 bg-white flex flex-col shrink-0">
            
            {/* Contacts Header */}
            <div className="p-4 bg-[#f0f2f5] text-slate-800 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#00a884] text-white font-black flex items-center justify-center text-xs shadow-xs">
                  WA
                </div>
                <div>
                  <h3 className="text-xs font-black tracking-tight text-slate-900">WhatsApp Contacts</h3>
                  <span className="text-[10px] text-[#00a884] font-mono font-bold">{contactsList.length} Active Contacts</span>
                </div>
              </div>

              <button
                onClick={fetchContactsList}
                className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 transition-colors border border-slate-200 shadow-2xs"
                title="Refresh Contacts"
              >
                <RotateCw className={`w-3.5 h-3.5 ${loadingContacts ? 'animate-spin text-[#00a884]' : ''}`} />
              </button>
            </div>

            {/* Contacts Filter & Search */}
            <div className="p-3 bg-[#f0f2f5]/60 border-b border-slate-200 space-y-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#00a884] shadow-2xs"
                />
              </div>

              {/* Segment & Identity Quick Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                {availableContactFilters.map(filter => (
                  <button
                    key={filter}
                    onClick={() => setContactFilter(filter)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all shrink-0 cursor-pointer border ${
                      contactFilter === filter
                        ? 'bg-[#00a884] text-white border-[#00a884] shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {filter === 'ALL' ? 'All Contacts' : filter}
                  </button>
                ))}
              </div>
            </div>

            {/* Contacts List */}
            <div className="flex-1 overflow-y-auto max-h-[500px] divide-y divide-slate-100">
              {loadingContacts ? (
                <div className="p-8 text-center text-xs text-slate-500 font-semibold">
                  <RotateCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#00a884]" />
                  Loading contacts...
                </div>
              ) : contactsList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 font-medium">
                  No contacts match your filter.
                </div>
              ) : (
                contactsList
                  .filter(c => {
                    const q = chatSearch.toLowerCase();
                    const matchesSearch = (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
                    const matchesFilter = contactFilter === 'ALL' ||
                      (c.identity || '').toLowerCase() === contactFilter.toLowerCase() ||
                      (c.segment || '').toLowerCase() === contactFilter.toLowerCase();
                    return matchesSearch && matchesFilter;
                  })
                  .sort((a, b) => {
                    const cleanA = String(a.phone).replace(/\D/g, '').slice(-10);
                    const cleanB = String(b.phone).replace(/\D/g, '').slice(-10);

                    const unreadA = unreadMap[cleanA] || 0;
                    const unreadB = unreadMap[cleanB] || 0;

                    const timeA = latestMsgTimeMap[cleanA] || 0;
                    const timeB = latestMsgTimeMap[cleanB] || 0;

                    // 1. Contacts with NEW UNREAD MESSAGES jump to ABSOLUTE #1 FIRST TOP POSITION!
                    if (unreadA > 0 || unreadB > 0) {
                      if (unreadA > 0 && unreadB === 0) return -1;
                      if (unreadB > 0 && unreadA === 0) return 1;
                      return timeB - timeA;
                    }

                    // 2. Sort remaining contacts by latest message activity timestamp (most recent at top!)
                    return timeB - timeA;
                  })
                  .map((c) => {
                    const isSelected = selectedContact?._id === c._id || selectedContact?.phone === c.phone;
                    const initial = (c.name || c.phone || 'C')[0].toUpperCase();

                    const cleanP = String(c.phone).replace(/\D/g, '').slice(-10);
                    const unreadCount = unreadMap[cleanP] || 0;

                    return (
                      <div
                        key={c._id || c.phone}
                        onClick={() => handleSelectContact(c)}
                        className={`p-3.5 flex items-center justify-between cursor-pointer transition-all ${
                          isSelected ? 'bg-[#f0f2f5] border-l-4 border-[#00a884]' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl font-black text-xs flex items-center justify-center shrink-0 shadow-2xs border ${
                            isSelected ? 'bg-[#00a884] text-white border-[#00a884]' : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {initial}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <h4 className="text-xs font-extrabold text-slate-900 truncate">
                                {c.name || `Contact +91 ${c.phone}`}
                              </h4>
                            </div>
                            <p className="text-[11px] text-slate-500 font-mono truncate">
                              +91 {c.phone}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {unreadCount > 0 ? (
                            <div className="flex items-center gap-1">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-extrabold bg-[#00a884] text-white animate-pulse">
                                NEW MESSAGE
                              </span>
                              <span className="w-5 h-5 rounded-full bg-[#00a884] text-white text-[10px] font-black flex items-center justify-center shadow-xs shrink-0">
                                {unreadCount}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-[#00a884] border border-emerald-200">
                              {c.identity || 'Contact'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* RIGHT PANEL: WHATSAPP WEB CHAT WINDOW (White Theme) */}
          <div className="flex-1 flex flex-col bg-[#efeae2] relative min-h-[540px]">
            
            {selectedContact ? (
              <>
                {/* Chat Header */}
                <div className="p-3.5 bg-[#f0f2f5] text-slate-900 flex items-center justify-between border-b border-slate-200 shadow-xs z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#00a884] text-white font-black text-xs flex items-center justify-center shadow-xs">
                      {(selectedContact.name || selectedContact.phone || 'C')[0].toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-xs font-black flex items-center gap-1.5 text-slate-900">
                        <span>{selectedContact.name || `+91 ${selectedContact.phone}`}</span>
                        <span className="text-[9px] text-[#00a884] bg-emerald-50 px-1.5 py-0.2 rounded font-mono font-bold border border-emerald-200">✓ WhatsApp Business</span>
                      </h3>
                      <p className="text-[10px] text-slate-500 font-mono">
                        +91 {selectedContact.phone} • {selectedContact.email || 'No email attached'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:+91${selectedContact.phone}`}
                      className="p-2 rounded-xl bg-white hover:bg-slate-100 text-[#00a884] border border-slate-200 transition-colors shadow-2xs"
                      title="Call Contact"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {/* Chat Messages Canvas (WhatsApp Light Pattern Background) */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3.5 max-h-[480px] scroll-smooth bg-[#efeae2]">
                  {/* System Info Security Banner */}
                  <div className="text-center my-2">
                    <span className="px-3 py-1 rounded-lg bg-white/90 text-slate-600 text-[10px] font-bold shadow-2xs border border-slate-200/80 font-mono">
                      🔒 Official Meta WhatsApp Cloud API • Live Connection
                    </span>
                  </div>

                  {/* Chat Messages (Sender Outgoing vs Receiver Incoming) */}
                  {(() => {
                    const activeCleanKey = getCleanPhone10(selectedContact?.phone);
                    const messages = chatLogMap[activeCleanKey] || [];
                    let lastDateLabel = null;

                    if (messages.length === 0) {
                      return (
                        <div className="text-center py-12 text-xs text-slate-500 font-medium">
                          No message history yet. Type a message below to start chatting!
                        </div>
                      );
                    }

                    return messages.map((msg) => {
                      const isIncoming = msg.type === 'INCOMING' || msg.status === 'received';
                      const currentDateLabel = getChatDateHeaderLabel(msg.rawTimestamp);
                      const showDateHeader = currentDateLabel !== lastDateLabel;
                      if (showDateHeader) {
                        lastDateLabel = currentDateLabel;
                      }

                      // Find matching template in templates state if templateName is attached
                      const matchingTemplate = msg.templateName
                        ? templates.find(t =>
                            (t.name || '').toLowerCase() === (msg.templateName || '').toLowerCase() ||
                            (t.id || '').toLowerCase() === (msg.templateName || '').toLowerCase() ||
                            (t._id || '').toLowerCase() === (msg.templateName || '').toLowerCase()
                          )
                        : null;

                      // Derived Header Image
                      const displayHeaderImg = msg.header_image_url || matchingTemplate?.header_image_url || matchingTemplate?.header_content || (typeof matchingTemplate?.imageUrl === 'string' && matchingTemplate.imageUrl.startsWith('http') ? matchingTemplate.imageUrl : '');

                      // Derived Buttons Array (check log buttons first, then fallback to template buttons)
                      let displayButtons = (Array.isArray(msg.buttons) && msg.buttons.length > 0)
                        ? msg.buttons
                        : (matchingTemplate?.buttons || []);

                      if (typeof displayButtons === 'string') {
                        try { displayButtons = JSON.parse(displayButtons); } catch { displayButtons = []; }
                      }
                      if ((!displayButtons || displayButtons.length === 0) && matchingTemplate?.components) {
                        const btnComp = matchingTemplate.components.find(c => (c.type || '').toUpperCase() === 'BUTTONS');
                        if (btnComp && Array.isArray(btnComp.buttons)) displayButtons = btnComp.buttons;
                      }

                      // Derived Body Text
                      let displayBodyText = (msg.text && msg.text !== 'Sent Message' && msg.text !== 'WhatsApp Template Message')
                        ? msg.text
                        : (matchingTemplate?.body_text || matchingTemplate?.message || 'Welcome to AOTMS Enterprise Solutions.');

                      // Derived Footer Text
                      const displayFooterText = matchingTemplate?.footer_text || matchingTemplate?.footer || '';

                      const isTemplateMsg = Boolean(msg.templateName || msg.type === 'OUTGOING_TEMPLATE' || displayHeaderImg || (displayButtons && displayButtons.length > 0));

                      return (
                        <React.Fragment key={msg.id}>
                          {showDateHeader && (
                            <div className="flex items-center justify-center my-3">
                              <span className="px-3.5 py-1 rounded-lg bg-white/95 text-slate-600 text-[10px] font-black shadow-2xs border border-slate-200 uppercase tracking-wider font-mono">
                                📅 {currentDateLabel}
                              </span>
                            </div>
                          )}

                          <div className={`flex flex-col ${isIncoming ? 'items-start' : 'items-end'}`}>
                            <div className={`rounded-2xl text-xs space-y-2 border shadow-xs overflow-hidden ${
                              isTemplateMsg ? 'max-w-[340px] sm:max-w-[360px] w-full p-0' : 'p-3.5 max-w-[80%]'
                            } ${
                              isIncoming
                                ? 'bg-white rounded-tl-none border-slate-200/80 text-slate-900'
                                : 'bg-[#d9fdd3] rounded-tr-none border-[#b4f5a9] text-slate-900'
                            }`}>
                              {/* Header Image Header for Template */}
                              {displayHeaderImg && (
                                <div className="w-full bg-slate-900/10 overflow-hidden relative">
                                  <img 
                                    src={displayHeaderImg} 
                                    alt="Header" 
                                    className="w-full h-44 object-cover" 
                                  />
                                </div>
                              )}

                              <div className={isTemplateMsg ? 'p-3.5 space-y-2' : ''}>
                                {/* Sender Name badge for incoming messages */}
                                {isIncoming && (
                                  <div className="text-[10px] font-extrabold text-[#00a884] flex items-center gap-1 font-mono">
                                    <span>👤 {msg.senderName || selectedContact.name || 'Customer'}</span>
                                    <span className="text-[9px] text-slate-500">(Received Reply)</span>
                                  </div>
                                )}

                                {/* Non-image header text if present */}
                                {!displayHeaderImg && matchingTemplate?.header_text && (
                                  <h4 className="font-extrabold text-slate-900 text-xs">
                                    {matchingTemplate.header_text}
                                  </h4>
                                )}

                                {msg.templateName && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-100/90 text-emerald-800 border border-emerald-300/80 uppercase inline-block shadow-2xs">
                                      {msg.templateName}
                                    </span>
                                    {matchingTemplate?.category && (
                                      <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-slate-200/80 text-slate-700 uppercase">
                                        {matchingTemplate.category}
                                      </span>
                                    )}
                                  </div>
                                )}

                                <p className="font-medium whitespace-pre-wrap leading-relaxed text-slate-900">
                                  {displayBodyText}
                                </p>

                                {displayFooterText && (
                                  <p className="text-[10px] text-slate-500 font-mono italic pt-1 border-t border-slate-300/40">
                                    {displayFooterText}
                                  </p>
                                )}

                                {/* Message Status and Double Checkmarks */}
                                <div className="flex items-center justify-end gap-1.5 text-[9px] font-mono text-slate-500 pt-0.5">
                                  <span>{msg.time}</span>
                                  {!isIncoming && (
                                    <span className="flex items-center gap-1 font-mono font-bold" title={`Status: ${msg.status}`}>
                                      {msg.status === 'read' ? (
                                        <span className="text-sky-500 font-extrabold flex items-center gap-0.5" title="Read by customer (Blue Tick)">
                                          <span className="text-[11px] leading-none">✓✓</span>
                                          <span className="text-[8px] font-sans">Read</span>
                                        </span>
                                      ) : msg.status === 'delivered' ? (
                                        <span className="text-slate-400 font-bold flex items-center gap-0.5" title="Delivered to phone">
                                          <span className="text-[11px] leading-none">✓✓</span>
                                          <span className="text-[8px] font-sans">Delivered</span>
                                        </span>
                                      ) : msg.status === 'failed' ? (
                                        <span className="text-rose-500 font-bold flex items-center gap-0.5" title={msg.errorMessage || "Failed"}>
                                          <span className="text-[11px] leading-none">✖</span>
                                          <span className="text-[8px] font-sans">Failed</span>
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 font-bold flex items-center gap-0.5" title="Sent to server">
                                          <span className="text-[11px] leading-none">✓</span>
                                          <span className="text-[8px] font-sans">Sent</span>
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Production Level WhatsApp Interactive Buttons */}
                              {displayButtons && displayButtons.length > 0 && (
                                <div className="border-t border-slate-300/70 divide-y divide-slate-300/70 bg-white/50">
                                  {displayButtons.map((b, i) => {
                                    const btnType = b.type || (b.url ? 'URL' : (b.phone_number ? 'PHONE_NUMBER' : 'QUICK_REPLY'));
                                    const btnLabel = b.text || b.displayText || b.title || b.url || b.phone_number || 'Interactive Action';

                                    return (
                                      <a
                                        key={i}
                                        href={btnType === 'URL' ? (b.url || '#') : (btnType === 'PHONE_NUMBER' ? `tel:${b.phone_number}` : '#')}
                                        target={btnType === 'URL' ? '_blank' : '_self'}
                                        rel="noreferrer"
                                        className="w-full py-2.5 px-3 text-center text-xs font-extrabold text-[#00a884] hover:bg-slate-100/70 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                      >
                                        {btnType === 'PHONE_NUMBER' ? (
                                          <Phone className="w-3.5 h-3.5 text-[#00a884]" />
                                        ) : btnType === 'URL' ? (
                                          <ExternalLink className="w-3.5 h-3.5 text-[#00a884]" />
                                        ) : (
                                          <Send className="w-3.5 h-3.5 text-[#00a884]" />
                                        )}
                                        <span>{btnLabel}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    });
                  })()}

                  <div ref={chatBottomRef} />
                </div>

                {/* WhatsApp Web Bottom Action Bar (Clean White WhatsApp Theme) */}
                <div className="p-3.5 bg-[#f0f2f5] border-t border-slate-200 relative">
                  
                  {/* Small Template Picker Popover Dropdown */}
                  {showTemplatePicker && (
                    <div className="absolute bottom-16 left-3.5 right-3.5 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 z-30 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[#00a884]" />
                          <h4 className="text-xs font-black text-slate-900">
                            Select Approved Meta Template for {selectedContact.name || selectedContact.phone}
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowTemplatePicker(false)}
                          className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-2 max-h-52 overflow-y-auto">
                        {templates.length === 0 ? (
                          <p className="text-xs text-slate-500 text-center py-4">No approved templates available.</p>
                        ) : (
                          templates.map(t => {
                            const isSelected = selectedChatTemplate === (t._id || t.id || t.metaTemplateId || t.name);
                            return (
                              <div
                                key={t._id || t.id || t.name}
                                onClick={() => setSelectedChatTemplate(t._id || t.id || t.metaTemplateId || t.name)}
                                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                  isSelected
                                    ? 'bg-emerald-50 border-[#00a884] ring-1 ring-[#00a884]'
                                    : 'bg-white border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#00a884] text-white uppercase">
                                      {t.category}
                                    </span>
                                    <span className="text-xs font-bold text-slate-900 truncate">{t.name}</span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{t.body_text}</p>
                                </div>
                                <span className={`text-[10px] font-extrabold px-2 py-1 rounded-lg ${
                                  isSelected ? 'bg-[#00a884] text-white' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {isSelected ? 'Selected ✓' : 'Select'}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {selectedChatTemplate && (
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                          <span className="text-[11px] font-mono font-bold text-[#00a884]">Ready to Send to {selectedContact.name || selectedContact.phone}</span>
                          <button
                            type="button"
                            onClick={() => {
                              handleSendTemplateInChat(selectedChatTemplate);
                              setShowTemplatePicker(false);
                            }}
                            disabled={sendingChatMsg}
                            className="px-4 py-2 rounded-xl bg-[#00a884] hover:bg-emerald-600 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Send Template Message</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Direct Text Message Form */}
                  <form onSubmit={handleSendDirectChatMessage} className="flex items-center gap-2">
                    {/* Small Select Template Button */}
                    <button
                      type="button"
                      onClick={() => setShowTemplatePicker(!showTemplatePicker)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-2xs ${
                        showTemplatePicker || selectedChatTemplate
                          ? 'bg-[#00a884] text-white border-[#00a884]'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                      title="Select & Send Approved Meta Template"
                    >
                      <FileText className="w-4 h-4" />
                      <span className="hidden sm:inline">Templates</span>
                    </button>

                    <input
                      type="text"
                      placeholder={`Type a WhatsApp message to ${selectedContact.name || selectedContact.phone}...`}
                      value={chatMessageText}
                      onChange={(e) => setChatMessageText(e.target.value)}
                      disabled={sendingChatMsg}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#00a884] font-medium shadow-2xs"
                    />
                    
                    <button
                      type="submit"
                      disabled={sendingChatMsg || !chatMessageText.trim()}
                      className="px-5 py-2.5 rounded-xl bg-[#00a884] hover:bg-emerald-600 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-40"
                    >
                      {sendingChatMsg ? <RotateCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      <span>Send</span>
                    </button>
                  </form>

                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 bg-[#efeae2]">
                <WhatsApp className="w-16 h-16 text-[#00a884] opacity-80" />
                <h3 className="text-sm font-extrabold text-slate-800">Select a Contact to Start Chat</h3>
                <p className="text-xs text-slate-500 max-w-xs">
                  Choose a contact from the left list to view live message history and real-time status indicators (`✓✓ Read`).
                </p>
              </div>
            )}

          </div>

        </div>
      ) : (
        /* VIEW MODE 2: TEMPLATES STUDIO GRID */
        <>
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
              {availableTemplateCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shrink-0 border ${
                    filterCategory === cat
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {cat === 'ALL' ? 'All Templates' : cat}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#00a884] shadow-xs"
              />
            </div>
          </div>

          {/* Templates Grid */}
          {loading ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
              <RotateCw className="w-6 h-6 animate-spin text-[#00a884] mx-auto mb-2" />
              <p className="text-xs text-slate-500 font-semibold">Loading Meta templates...</p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No message templates found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Create your first official Meta WhatsApp template for Marketing broadcasts or Utility notifications.
              </p>
              <button
                onClick={openCreateModal}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Template</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {paginatedTemplates.map((tmpl) => {
                  let parsedButtons = [];
                  try {
                    parsedButtons = typeof tmpl.buttons === 'string' ? JSON.parse(tmpl.buttons) : (tmpl.buttons || []);
                  } catch (e) {
                    parsedButtons = [];
                  }

                  return (
                    <div 
                      key={tmpl.id || tmpl.name}
                      className="p-5 rounded-2xl bg-white border border-slate-200 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] hover:shadow-xl hover:border-emerald-300 transition-all duration-200 flex flex-col justify-between space-y-4 group relative overflow-hidden"
                    >
                      <div className="space-y-3">
                        
                        {/* Header bar */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-600 uppercase border border-slate-200">
                              {tmpl.category}
                            </span>
                            <h3 className="text-sm font-black text-slate-900 group-hover:text-emerald-700 transition-colors mt-1 truncate max-w-[200px]">
                              {tmpl.name}
                            </h3>
                          </div>

                          {/* Live Meta Status Selector */}
                          <select
                            value={tmpl.status || 'APPROVED'}
                            onChange={(e) => handleUpdateStatus(tmpl, e.target.value)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold cursor-pointer border focus:outline-none transition-all shadow-2xs ${
                              tmpl.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' :
                              tmpl.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' :
                              tmpl.status === 'REJECTED' ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' :
                              'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            <option value="APPROVED">APPROVED</option>
                            <option value="PENDING">PENDING</option>
                            <option value="REJECTED">REJECTED</option>
                            <option value="DRAFT">DRAFT</option>
                          </select>
                        </div>

                        {/* Preview box */}
                        <div className="p-3.5 rounded-xl bg-emerald-50/40 border border-emerald-100 space-y-2 text-xs">
                          {tmpl.header_image_url && !brokenImages[tmpl._id || tmpl.id] ? (
                            <div className="relative rounded-lg overflow-hidden border border-emerald-200/80 bg-slate-100 max-h-32">
                              <img 
                                src={tmpl.header_image_url} 
                                alt="Header" 
                                className="w-full h-28 object-cover" 
                                onError={() => setBrokenImages(prev => ({ ...prev, [tmpl._id || tmpl.id]: true }))}
                              />
                            </div>
                          ) : (tmpl.header_type === 'IMAGE' || (tmpl.category || '').toUpperCase() === 'UTILITY') ? (
                            <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-xl flex items-center justify-between text-amber-900 shadow-2xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <ImageOff className="w-4 h-4 text-amber-600 shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-[11px] font-bold text-amber-900 truncate">Image Not Showing</div>
                                  <div className="text-[9px] text-amber-600 font-medium truncate">Click to attach/update image</div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleEditTemplate(tmpl)}
                                className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold shadow-2xs transition-colors shrink-0 cursor-pointer"
                              >
                                Update Utility
                              </button>
                            </div>
                          ) : null}
                          {tmpl.header_text && !tmpl.header_image_url && tmpl.header_type !== 'IMAGE' && (
                            <div className="font-extrabold text-slate-900 border-b border-emerald-200/60 pb-1">
                              {tmpl.header_text}
                            </div>
                          )}
                          <p className="text-slate-800 line-clamp-3 leading-relaxed whitespace-pre-wrap font-medium">
                            {tmpl.body_text}
                          </p>
                          {tmpl.footer_text && (
                            <p className="text-[10px] text-slate-400 italic pt-1 border-t border-emerald-100">
                              {tmpl.footer_text}
                            </p>
                          )}
                        </div>

                        {/* Buttons preview */}
                        {parsedButtons.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Action Buttons ({parsedButtons.length})</span>
                            <div className="flex flex-col gap-1">
                              {parsedButtons.map((btn, idx) => (
                                <div key={idx} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-emerald-700 text-xs font-extrabold flex items-center justify-between shadow-2xs">
                                  <span className="truncate">{btn.text || btn.url || btn.phone_number}</span>
                                  <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{btn.type}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewTemplate(tmpl)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                          <span>Preview</span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEditTemplate(tmpl)}
                            className="p-1.5 rounded-xl bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-700 border border-slate-200 transition-colors cursor-pointer"
                            title="Edit Template"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(tmpl)}
                            className="p-1.5 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 border border-slate-200 transition-colors cursor-pointer"
                            title="Delete Template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* Pagination Footer Controls */}
              {filteredTemplates.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs gap-3">
                  <div className="text-xs font-bold text-slate-500">
                    Showing <span className="text-slate-900 font-extrabold">{paginatedTemplates.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0}</span> to <span className="text-slate-900 font-extrabold">{Math.min(currentPage * ITEMS_PER_PAGE, filteredTemplates.length)}</span> of <span className="text-slate-900 font-extrabold">{filteredTemplates.length}</span> templates
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-extrabold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Previous</span>
                    </button>

                    <span className="px-3.5 py-1.5 text-xs font-black text-slate-900 bg-slate-100 rounded-lg font-mono">
                      Page {currentPage} of {totalPages}
                    </span>

                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                      disabled={currentPage >= totalPages}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-extrabold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE / EDIT TEMPLATE STUDIO WITH LIVE PHONE PREVIEW             */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="relative w-full max-w-5xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                  <WhatsApp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Create Message Template & Actions Studio
                  </h3>
                  <p className="text-xs text-slate-500">
                    Upload local images, configure action buttons (Call Phone Number, Call on WhatsApp, Share Contact Info, Custom), and preview live.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer border border-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Split Content: Form Left, WhatsApp Phone Preview Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto">
              
              {/* LEFT COLUMN: FORM CONTROLS (7 Cols) */}
              <form onSubmit={handleCreateTemplate} id="template-create-form" className="lg:col-span-7 p-6 space-y-5 border-r border-slate-200 overflow-y-auto">
                
                {/* 1. Category Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    1. Template Category <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, category: 'MARKETING' })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        formData.category === 'MARKETING'
                          ? 'bg-purple-50/60 border-purple-500 ring-2 ring-purple-500/20 text-purple-900'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="text-xs font-extrabold">Marketing</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Offers, welcome deals, product launches</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, category: 'UTILITY' })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        formData.category === 'UTILITY'
                          ? 'bg-teal-50/60 border-teal-500 ring-2 ring-teal-500/20 text-teal-900'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="text-xs font-extrabold">Utility</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Order receipts, transactional alerts, OTP</div>
                    </button>
                  </div>
                </div>

                {/* 2. Template Name & Language */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      2. Template Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter your template name (e.g. ram_special_offer)"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Enter your own custom template name.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Language
                    </label>
                    <select
                      value={formData.language}
                      onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="en">English - en</option>
                      <option value="en_US">English (US) - en_US</option>
                      <option value="hi">Hindi - hi</option>
                      <option value="te">Telugu - te</option>
                    </select>
                  </div>
                </div>

                {/* 3. Header Media Type & Image */}
                <div className="space-y-3 p-4 rounded-2xl bg-slate-50/70 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      3. Header Media
                    </label>
                    <div className="flex items-center gap-3">
                      {['NONE', 'IMAGE', 'TEXT'].map((type) => (
                        <label key={type} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            name="header_type"
                            value={type}
                            checked={formData.header_type === type}
                            onChange={() => setFormData({ ...formData, header_type: type })}
                            className="accent-emerald-600"
                          />
                          <span className="font-semibold">{type === 'IMAGE' ? 'Image' : type}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {formData.header_type === 'TEXT' && (
                    <input
                      type="text"
                      placeholder="Enter bold header title text..."
                      value={formData.header_text}
                      onChange={(e) => setFormData({ ...formData, header_text: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                  )}

                  {formData.header_type === 'IMAGE' && (
                    <div className="space-y-2">
                      {/* Hidden File Input */}
                      <input 
                        ref={fileInputRef}
                        type="file" 
                        accept="image/png,image/jpeg,image/jpg,image/webp" 
                        className="hidden" 
                        onChange={handleImageFileChange}
                      />

                      {!formData.header_image_url ? (
                        /* Empty Upload Image Container */
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          className="p-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-white hover:bg-emerald-50/20 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2 group shadow-2xs"
                        >
                          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                            <UploadCloud className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">
                              Upload Header Image
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Click to choose image (PNG, JPG, JPEG, WEBP)
                            </div>
                          </div>
                          <span className="mt-1 px-3 py-1.5 rounded-lg bg-emerald-600 group-hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs flex items-center gap-1.5 transition-colors">
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span>Select Image File</span>
                          </span>
                        </div>
                      ) : (
                        /* Uploaded Image Card */
                        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-center gap-3.5 shadow-2xs">
                          <img 
                            src={formData.header_image_url} 
                            alt="Header Upload" 
                            className="w-16 h-14 object-cover rounded-xl border border-slate-200 shadow-xs shrink-0"
                            onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80"; }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              Header Image Uploaded
                            </div>
                            <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                              ✓ Ready for Meta Template
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                            >
                              Change
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, header_image_url: '' }))}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Remove Image"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 4. Body Text */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    4. Message Body <span className="text-rose-500">*</span>
                  </label>

                  <textarea
                    rows={4}
                    required
                    value={formData.body_text}
                    onChange={(e) => setFormData({ ...formData, body_text: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 font-normal leading-relaxed"
                  />
                </div>

                {/* 5. Footer Text */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    5. Footer Text (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AOTMS"
                    value={formData.footer_text}
                    onChange={(e) => setFormData({ ...formData, footer_text: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* 6. Interactive Action Buttons (Complete Flow) */}
                <div className="space-y-3 p-4 rounded-2xl bg-slate-50/70 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-bold text-slate-800">
                        6. Interactive Action Buttons ({formData.buttons.length}/3)
                      </label>
                      <span className="text-[10px] text-slate-500">
                        Select an action button to attach to the WhatsApp message:
                      </span>
                    </div>
                  </div>

                  {/* Button Type Selector Strip */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {buttonTypeOptions.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => addButton(opt.type)}
                          disabled={formData.buttons.length >= 3}
                          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${opt.color} hover:shadow-xs`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>+ {opt.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Buttons List Editor */}
                  <div className="space-y-2.5 pt-1">
                    {formData.buttons.map((btn, index) => {
                      const opt = buttonTypeOptions.find(o => o.type === btn.type) || buttonTypeOptions[0];
                      const Icon = opt.icon;

                      return (
                        <div key={index} className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px] font-bold flex items-center justify-center">
                                {index + 1}
                              </span>
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${opt.color}`}>
                                <Icon className="w-3 h-3" />
                                <span>{opt.label}</span>
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeButton(index)}
                              className="text-slate-400 hover:text-rose-600 cursor-pointer p-1 rounded hover:bg-rose-50"
                              title="Delete Button"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Dynamic Button Inputs based on type */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Button Display Text</label>
                              <input
                                type="text"
                                required
                                value={btn.text}
                                onChange={(e) => {
                                  const newBtns = [...formData.buttons];
                                  newBtns[index].text = e.target.value;
                                  setFormData({ ...formData, buttons: newBtns });
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                              />
                            </div>

                            {(btn.type === 'PHONE_NUMBER' || btn.type === 'WHATSAPP_CALL') && (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                  {btn.type === 'WHATSAPP_CALL' ? 'WhatsApp Phone Number' : 'Telephone Number'}
                                </label>
                                <input
                                  type="tel"
                                  placeholder="+919876543210"
                                  value={btn.phone_number || ''}
                                  onChange={(e) => {
                                    const newBtns = [...formData.buttons];
                                    newBtns[index].phone_number = e.target.value;
                                    setFormData({ ...formData, buttons: newBtns });
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                                />
                              </div>
                            )}

                            {btn.type === 'CONTACT' && (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Business Contact Name</label>
                                <input
                                  type="text"
                                  placeholder="e.g. AOTMS Support Desk"
                                  value={btn.contact_name || ''}
                                  onChange={(e) => {
                                    const newBtns = [...formData.buttons];
                                    newBtns[index].contact_name = e.target.value;
                                    setFormData({ ...formData, buttons: newBtns });
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                                />
                              </div>
                            )}

                            {btn.type === 'URL' && (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Website Link URL</label>
                                <input
                                  type="url"
                                  placeholder="https://aotms.com"
                                  value={btn.url || ''}
                                  onChange={(e) => {
                                    const newBtns = [...formData.buttons];
                                    newBtns[index].url = e.target.value;
                                    setFormData({ ...formData, buttons: newBtns });
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </form>

              {/* RIGHT COLUMN: REALISTIC WHATSAPP PHONE PREVIEW (5 Cols) */}
              <div className="lg:col-span-5 p-6 bg-slate-100/70 flex flex-col items-center justify-start overflow-y-auto lg:sticky lg:top-0">
                <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col relative max-h-[580px]">
                  
                  {/* WhatsApp Phone Mock Header */}
                  <div className="bg-[#075e54] text-white p-3.5 flex items-center justify-between shrink-0 z-10 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-emerald-400 text-emerald-950 font-black text-xs flex items-center justify-center shadow-xs">
                        A
                      </div>
                      <div>
                        <div className="text-xs font-bold flex items-center gap-1 leading-tight">
                          <span>AOTMS Official</span>
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 text-emerald-900 text-[8px] flex items-center justify-center font-bold">✓</span>
                        </div>
                        <div className="text-[10px] text-emerald-100/80">Business Account</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono bg-[#128c7e] px-2 py-0.5 rounded text-white font-bold">Live Preview</span>
                  </div>

                  {/* Chat Wallpaper Canvas with Smooth Automatic Scrolling */}
                  <div 
                    ref={previewChatRef}
                    className="p-4 bg-[#efeae2] flex-1 overflow-y-auto scroll-smooth space-y-3 scrollbar-thin scrollbar-thumb-slate-400/40 hover:scrollbar-thumb-slate-400"
                    style={{ maxHeight: '460px' }}
                  >
                    
                    {/* Message Bubble */}
                    <div className="bg-white rounded-2xl rounded-tl-none p-3 shadow-sm border border-slate-200/60 space-y-2 max-w-[95%]">
                      
                      {/* Image Header Preview */}
                      {formData.header_type === 'IMAGE' && formData.header_image_url && (
                        <div className="rounded-xl overflow-hidden max-h-48 w-full bg-slate-100 shadow-2xs">
                          <img 
                            src={formData.header_image_url} 
                            alt="Header Preview" 
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80"; }}
                          />
                        </div>
                      )}

                      {/* Text Header Preview */}
                      {formData.header_type === 'TEXT' && formData.header_text && (
                        <h4 className="text-xs font-black text-slate-900 pb-1 border-b border-slate-100">
                          {formData.header_text}
                        </h4>
                      )}

                      {/* Body Text with Live Variable Replacement */}
                      <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-line font-normal">
                        {renderPreviewBody(formData.body_text, formData.sample_values)}
                      </p>

                      {/* Footer */}
                      {formData.footer_text && (
                        <p className="text-[10px] text-slate-400 font-medium">
                          {formData.footer_text}
                        </p>
                      )}

                      {/* Time & Double Checkmarks */}
                      <div className="flex items-center justify-end gap-1 text-[9px] text-slate-400 font-mono">
                        <span>10:45 AM</span>
                        <span className="text-sky-500 font-bold">✓✓</span>
                      </div>
                    </div>

                    {/* Interactive Action Buttons Preview (Realistic WhatsApp Native View) */}
                    {formData.buttons && formData.buttons.length > 0 && (
                      <div className="space-y-1.5 max-w-[95%]">
                        {formData.buttons.map((btn, i) => (
                          <div 
                            key={i}
                            className="p-2.5 rounded-xl bg-white/95 border border-slate-200/80 shadow-xs text-center text-xs font-bold text-sky-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {btn.type === 'WHATSAPP_CALL' && <WhatsApp className="w-3.5 h-3.5 text-emerald-600" />}
                            {btn.type === 'PHONE_NUMBER' && <Phone className="w-3.5 h-3.5 text-emerald-600" />}
                            {btn.type === 'CONTACT' && <UserCheck className="w-3.5 h-3.5 text-amber-600" />}
                            {btn.type === 'URL' && <ExternalLink className="w-3.5 h-3.5 text-sky-600" />}
                            {btn.type === 'CUSTOM' && <Send className="w-3 h-3 text-purple-600" />}
                            <span>{btn.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>

                  {/* Auto-scroll helper controls */}
                  <div className="p-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono text-slate-500 px-3 shrink-0">
                    <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Auto-Scroll Active</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button 
                        type="button" 
                        onClick={() => previewChatRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="hover:text-slate-900 font-bold cursor-pointer"
                      >
                        Top ↑
                      </button>
                      <span>•</span>
                      <button 
                        type="button" 
                        onClick={() => previewChatRef.current?.scrollTo({ top: previewChatRef.current.scrollHeight, behavior: 'smooth' })}
                        className="hover:text-slate-900 font-bold cursor-pointer"
                      >
                        Bottom ↓
                      </button>
                    </div>
                  </div>

                </div>
              </div>

            </div>

            {/* Modal Bottom Action Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                form="template-create-form"
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? <RotateCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{submitting ? 'Saving to Meta...' : 'Create Template on Meta'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: STANDALONE CHAT PREVIEW POPUP (AUTOMATIC SCROLL SUPPORT)          */}
      {/* ========================================================================= */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-150">
            
            <div className="bg-[#075e54] text-white p-4 flex items-center justify-between shrink-0 shadow-xs">
              <div className="flex items-center gap-2.5">
                <WhatsApp className="w-5 h-5 text-emerald-300" />
                <div>
                  <div className="text-xs font-bold font-mono">{previewTemplate.name}</div>
                  <div className="text-[10px] text-emerald-100">{previewTemplate.category} • {previewTemplate.language}</div>
                </div>
              </div>
              <button 
                onClick={() => setPreviewTemplate(null)}
                className="p-1 rounded-lg bg-emerald-800/80 hover:bg-emerald-900 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable chat canvas with smooth scrolling */}
            <div 
              ref={previewModalChatRef}
              className="p-4 bg-[#efeae2] flex-1 overflow-y-auto scroll-smooth space-y-3 scrollbar-thin scrollbar-thumb-slate-400/40"
              style={{ maxHeight: '460px' }}
            >
              <div className="bg-white rounded-2xl rounded-tl-none p-3.5 shadow-sm border border-slate-200/60 space-y-2">
                {previewTemplate.header_type === 'IMAGE' && (previewTemplate.header_image_url || previewTemplate.header_content) && (
                  <div className="rounded-xl overflow-hidden max-h-48 w-full bg-slate-100 border border-slate-200">
                    <img src={previewTemplate.header_image_url || previewTemplate.header_content} alt="Header" className="w-full h-full object-cover" />
                  </div>
                )}
                {previewTemplate.header_type === 'TEXT' && (previewTemplate.header_text || previewTemplate.header_content) && (
                  <h4 className="text-xs font-black text-slate-900 pb-1 border-b border-slate-100 font-sans">
                    {previewTemplate.header_text || previewTemplate.header_content}
                  </h4>
                )}
                <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-line font-normal">
                  {renderPreviewBody(previewTemplate.body_text, ['Customer', 'AOTMS2026'])}
                </p>
                {previewTemplate.footer_text && (
                  <p className="text-[10px] text-slate-400 font-medium">{previewTemplate.footer_text}</p>
                )}
                <div className="flex items-center justify-end gap-1 text-[9px] text-slate-400 font-mono">
                  <span>10:45 AM</span>
                  <span className="text-sky-500 font-bold">✓✓</span>
                </div>
              </div>

              {/* Render buttons in standalone preview too */}
              {(() => {
                let pButtons = [];
                try {
                  pButtons = typeof previewTemplate.buttons === 'string' ? JSON.parse(previewTemplate.buttons) : (previewTemplate.buttons || []);
                } catch(e) { pButtons = []; }

                return pButtons.length > 0 ? (
                  <div className="space-y-1.5 max-w-[95%]">
                    {pButtons.map((btn, i) => (
                      <div 
                        key={i}
                        className="p-2.5 rounded-xl bg-white/95 border border-slate-200/80 shadow-xs text-center text-xs font-bold text-sky-600 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {btn.type === 'WHATSAPP_CALL' && <WhatsApp className="w-3.5 h-3.5 text-emerald-600" />}
                        {btn.type === 'PHONE_NUMBER' && <Phone className="w-3.5 h-3.5 text-emerald-600" />}
                        {btn.type === 'CONTACT' && <UserCheck className="w-3.5 h-3.5 text-amber-600" />}
                        {btn.type === 'URL' && <ExternalLink className="w-3.5 h-3.5 text-sky-600" />}
                        {btn.type === 'CUSTOM' && <Send className="w-3 h-3 text-purple-600" />}
                        <span>{btn.text}</span>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-[10px] text-slate-400 font-mono">Smooth Scrolling Active</span>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs cursor-pointer transition-colors"
              >
                Close Preview
              </button>
            </div>

          </div>
        </div>
      )}

      {/* In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

    </div>
  );
}
