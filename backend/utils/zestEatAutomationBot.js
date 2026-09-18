const { sendTextMessage, sendButtons, sendListMenu } = require('./whatsappService');
const MessageLog = require('../models/MessageLog');

// In-memory conversation state map for active sessions
const userSessions = new Map();

/**
 * ZestEat WhatsApp Automation Bot Handler
 * Exactly implements ZestEat_WhatsApp_Automated_Templates_Chart flow, Custom Feedback Capture,
 * and Stop Conversation Automation on EVERY message.
 */
const handleZestEatAutomation = async ({ phone, text, payload, senderName, incomingPhoneId, incomingWabaId, io }) => {
  const cleanP = String(phone).replace(/\D/g, '');
  const rawInput = (payload || text || '').toLowerCase().trim();
  const userName = senderName || 'Customer';

  // Session state getter/setter
  let session = userSessions.get(cleanP) || { state: 'MAIN', lastItem: '' };

  let responseSentText = '';
  let sentMessageResult = null;

  // ── 0. STOP CONVERSATION TRIGGER & SUPPRESSION ─────────────────────────────
  if (['stop', 'btn_stop_bot', 'stop conversation', 'exit', 'unsubscribe', 'stop bot'].includes(rawInput)) {
    session.state = 'STOPPED';
    userSessions.set(cleanP, session);

    responseSentText = `🛑 *ZestEat Conversation Stopped*\n\n` +
      `You have successfully stopped the automated bot conversation. We will no longer send automated bot responses to this chat.\n\n` +
      `To restart the conversation anytime, simply reply *START* or *MENU*.`;

    try {
      sentMessageResult = await sendButtons(
        cleanP,
        responseSentText,
        [
          { buttonId: 'btn_main_menu', buttonText: { displayText: '▶️ Start Bot' } }
        ],
        'ZestEat Conversation Stopped',
        'Reply START to re-enable automated responses'
      );
    } catch (err) {
      sentMessageResult = await sendTextMessage(cleanP, responseSentText + `\n\n_Reply *START* or *MENU* to restart._`);
    }
  }

  // If session is STOPPED and user hasn't explicitly restarted, ignore automated responses
  else if (session.state === 'STOPPED' && !['main_menu', 'btn_main_menu', 'hi', 'hello', 'start', 'menu', 'reset'].includes(rawInput)) {
    console.log(`🛑 [ZESTEAT BOT] Automated responses suppressed for ${cleanP} (Session STOPPED)`);
    return;
  }

  // ── 1. RESET / MAIN MENU TRIGGER ──────────────────────────────────────────
  else if (['main_menu', 'btn_main_menu', 'hi', 'hello', 'start', 'menu', 'reset'].some(k => rawInput === k)) {
    session.state = 'MAIN';
    userSessions.set(cleanP, session);

    responseSentText = `Hello ${userName}! 👋 Welcome to *ZestEat Enterprise Automation*.\n\nPlease select an option to get started:`;
    
    try {
      sentMessageResult = await sendButtons(
        cleanP,
        responseSentText,
        [
          { buttonId: 'btn_order', buttonText: { displayText: '📦 Order' } },
          { buttonId: 'btn_feedback', buttonText: { displayText: '⭐ Feedback' } },
          { buttonId: 'btn_stop_bot', buttonText: { displayText: '🛑 Stop Bot' } }
        ],
        'ZestEat Main Menu',
        'Select Order, Feedback, or Stop Conversation'
      );
    } catch (err) {
      sentMessageResult = await sendTextMessage(
        cleanP,
        `*ZestEat Main Menu*\n\n${responseSentText}\n\n1️⃣ *Order*\n2️⃣ *Feedback*\n3️⃣ *Stop Conversation* (Reply STOP)`
      );
    }
  }

  // ── 2. MAIN OPTION SELECTION: ORDER ───────────────────────────────────────
  else if (rawInput === 'btn_order' || rawInput === 'order' || (session.state === 'MAIN' && (rawInput === '1' || rawInput === '1. order'))) {
    session.state = 'ORDER_MENU';
    userSessions.set(cleanP, session);

    responseSentText = `📦 *ZestEat Order Categories*\n\nPlease select an order subcategory below:`;

    try {
      sentMessageResult = await sendListMenu(cleanP, {
        title: 'ZestEat Order Categories 📦',
        description: 'Please select an order subcategory below:',
        buttonText: 'Select Category',
        footer: 'Reply STOP anytime to stop conversation',
        sections: [
          {
            title: 'Order Subcategories',
            rows: [
              { rowId: 'btn_food', title: '🍕 Food', description: 'Explore hot restaurant dishes' },
              { rowId: 'btn_meat', title: '🥩 Meat', description: 'Fresh chicken, mutton, fish & seafood' },
              { rowId: 'btn_zesteat_market', title: '🏪 ZestEat Market', description: 'Groceries & daily essentials' },
              { rowId: 'btn_stop_bot', title: '🛑 Stop Conversation', description: 'Stop automated bot responses' }
            ]
          }
        ]
      });
    } catch (err) {
      sentMessageResult = await sendTextMessage(
        cleanP,
        `*ZestEat Order Categories*\n\n${responseSentText}\n\n1️⃣ *Food*\n2️⃣ *Meat*\n3️⃣ *ZestEat Market*\n4️⃣ *Stop Conversation*\n\n_Reply 1, 2, 3, or STOP_`
      );
    }
  }

  // ── 3. SUB-CATEGORY: MEAT MENU ────────────────────────────────────────────
  else if (rawInput === 'btn_meat' || rawInput === 'meat' || (session.state === 'ORDER_MENU' && (rawInput === '2' || rawInput === '2. meat'))) {
    session.state = 'MEAT_MENU';
    userSessions.set(cleanP, session);

    responseSentText = `🥩 *ZestEat Meat Selection*\n\nPlease select a meat category:`;

    try {
      sentMessageResult = await sendListMenu(cleanP, {
        title: 'ZestEat Meat Categories 🥩',
        description: 'Choose your preferred meat product below:',
        buttonText: 'Select Meat Item',
        footer: 'Reply STOP anytime to stop automated bot',
        sections: [
          {
            title: 'Meat Subcategories',
            rows: [
              { rowId: 'btn_meat_chicken', title: '🍗 Chicken', description: 'Fresh farm-raised chicken' },
              { rowId: 'btn_meat_mutton', title: '🍖 Mutton', description: 'Tender goat & lamb mutton' },
              { rowId: 'btn_meat_fish', title: '🐟 Fish', description: 'Fresh river & sea fish' },
              { rowId: 'btn_meat_seafood', title: '🦐 Other Seafood', description: 'Prawns, crabs & seafood' },
              { rowId: 'btn_stop_bot', title: '🛑 Stop Conversation', description: 'Stop automated bot responses' }
            ]
          }
        ]
      });
    } catch (err) {
      sentMessageResult = await sendTextMessage(
        cleanP,
        `🥩 *ZestEat Meat Selection*\n\n1️⃣ *Chicken*\n2️⃣ *Mutton*\n3️⃣ *Fish*\n4️⃣ *Other Seafood*\n5️⃣ *Stop Conversation*\n\n_Reply 1-5_`
      );
    }
  }

  // ── 4. ORDER ASSISTANCE FAQ (Food / ZestEat Market / Meat items) ─────────
  else if (
    rawInput === 'btn_food' || rawInput === 'food' || (session.state === 'ORDER_MENU' && rawInput === '1') ||
    rawInput === 'btn_zesteat_market' || rawInput === 'zesteat market' || rawInput === 'market' || (session.state === 'ORDER_MENU' && rawInput === '3') ||
    ['btn_meat_chicken', 'chicken', '1'].includes(rawInput) && session.state === 'MEAT_MENU' ||
    ['btn_meat_mutton', 'mutton', '2'].includes(rawInput) && session.state === 'MEAT_MENU' ||
    ['btn_meat_fish', 'fish', '3'].includes(rawInput) && session.state === 'MEAT_MENU' ||
    ['btn_meat_seafood', 'seafood', 'other seafood', '4'].includes(rawInput) && session.state === 'MEAT_MENU'
  ) {
    let selectedName = 'Order';
    if (rawInput.includes('food') || (session.state === 'ORDER_MENU' && rawInput === '1')) selectedName = 'Food';
    else if (rawInput.includes('market') || (session.state === 'ORDER_MENU' && rawInput === '3')) selectedName = 'ZestEat Market';
    else if (rawInput.includes('chicken') || rawInput === '1') selectedName = 'Chicken';
    else if (rawInput.includes('mutton') || rawInput === '2') selectedName = 'Mutton';
    else if (rawInput.includes('fish') || rawInput === '3') selectedName = 'Fish';
    else if (rawInput.includes('seafood') || rawInput === '4') selectedName = 'Other Seafood';

    session.state = 'FAQ_VIEW';
    session.lastItem = selectedName;
    userSessions.set(cleanP, session);

    responseSentText = `📦 *ZestEat Order Assistance (${selectedName})*\n\n` +
      `1️⃣ *How long will my order take to arrive?*\n` +
      `👉 Delivery time depends on the restaurant/store, distance, order volume, and availability.\n\n` +
      `2️⃣ *Can I cancel my order?*\n` +
      `👉 Cancellation depends on the order status and the applicable cancellation policy.\n\n` +
      `3️⃣ *Can I modify my order after placing it?*\n` +
      `👉 Changes may not be possible after the seller starts preparing your order. Contact support as soon as possible.\n\n` +
      `4️⃣ *Live chat*\n` +
      `👉 Connect with our support team for assistance with your order.`;

    try {
      sentMessageResult = await sendButtons(
        cleanP,
        responseSentText,
        [
          { buttonId: 'btn_live_chat', buttonText: { displayText: '💬 Live Chat' } },
          { buttonId: 'btn_main_menu', buttonText: { displayText: '🔙 Main Menu' } },
          { buttonId: 'btn_stop_bot', buttonText: { displayText: '🛑 Stop Bot' } }
        ],
        `ZestEat ${selectedName} Assistance`,
        'Click Live Chat, Main Menu, or Stop Conversation'
      );
    } catch (err) {
      sentMessageResult = await sendTextMessage(
        cleanP,
        responseSentText + `\n\n_Reply LIVE CHAT for support, MENU for main menu, or STOP to end conversation._`
      );
    }
  }

  // ── 5. MAIN OPTION SELECTION: FEEDBACK PROMPT ──────────────────────────────
  else if (rawInput === 'btn_feedback' || rawInput === 'feedback' || (session.state === 'MAIN' && (rawInput === '2' || rawInput === '2. feedback'))) {
    session.state = 'AWAITING_FEEDBACK_TEXT';
    userSessions.set(cleanP, session);

    responseSentText = `⭐ *ZestEat Feedback & Rating*\n\n` +
      `Hello ${userName}! 👋 Thank you for choosing *ZestEat*.\n\n` +
      `We would love to hear about your experience! Please share your thoughts with us:\n\n` +
      `1️⃣ How was your order & food quality?\n` +
      `2️⃣ How was your delivery experience?\n` +
      `3️⃣ Do you have any feedback or suggestions for us?\n\n` +
      `✍️ *Please write and type your feedback message below and press Send:*`;

    try {
      sentMessageResult = await sendButtons(
        cleanP,
        responseSentText,
        [
          { buttonId: 'btn_live_chat', buttonText: { displayText: '💬 Live Chat' } },
          { buttonId: 'btn_main_menu', buttonText: { displayText: '🔙 Main Menu' } },
          { buttonId: 'btn_stop_bot', buttonText: { displayText: '🛑 Stop Bot' } }
        ],
        'ZestEat Feedback Prompt',
        'Type feedback below or click an option'
      );
    } catch (err) {
      sentMessageResult = await sendTextMessage(
        cleanP,
        responseSentText + `\n\n_Type your feedback directly in chat or reply STOP to exit._`
      );
    }
  }

  // ── 6. CUSTOMER WRITES FEEDBACK INPUT -> THANK YOU GREETING ────────────────
  else if (session.state === 'AWAITING_FEEDBACK_TEXT' && text && !rawInput.startsWith('btn_')) {
    const customerFeedbackText = text.trim();
    session.state = 'MAIN';
    userSessions.set(cleanP, session);

    responseSentText = `🎉 *Thank You for Choosing ZestEat!* 🍽️\n\n` +
      `Dear ${userName},\n\n` +
      `Thank you so much for sharing your valuable feedback with us:\n` +
      `💬 _"${customerFeedbackText}"_\n\n` +
      `We truly appreciate your time and support! Your feedback helps us continuously improve our food quality, packaging, and super-fast delivery services.\n\n` +
      `We look forward to serving you another delicious meal soon! 💛\n\n` +
      `🌐 *Website:* https://www.zesteat.in/\n` +
      `📞 *Support Desk:* +91 8566856789`;

    try {
      sentMessageResult = await sendButtons(
        cleanP,
        responseSentText,
        [
          { buttonId: 'btn_order', buttonText: { displayText: '📦 Order Now' } },
          { buttonId: 'btn_main_menu', buttonText: { displayText: '🔙 Main Menu' } },
          { buttonId: 'btn_stop_bot', buttonText: { displayText: '🛑 Stop Bot' } }
        ],
        'ZestEat Thank You',
        'Thank you for choosing ZestEat!'
      );
    } catch (err) {
      sentMessageResult = await sendTextMessage(cleanP, responseSentText);
    }
  }

  // ── 7. SUPPORT & LIVE CHAT CONNECTION ──────────────────────────────────────
  else if (rawInput === 'btn_live_chat' || rawInput === 'live chat' || rawInput === 'chat' || rawInput === 'support' || (['FAQ_VIEW', 'AWAITING_FEEDBACK_TEXT'].includes(session.state) && (rawInput === '4' || rawInput === '5'))) {
    session.state = 'LIVE_SUPPORT';
    userSessions.set(cleanP, session);

    responseSentText = `💬 *ZestEat Live Support Desk*\n\n` +
      `Connecting you with our support team for assistance with your order.\n\n` +
      `📞 *Call/WhatsApp Support Desk:* +91 8566856789\n` +
      `🌐 *Website:* https://www.zesteat.in/\n\n` +
      `An active support agent has been notified and will respond to your chat shortly!`;

    try {
      sentMessageResult = await sendButtons(
        cleanP,
        responseSentText,
        [
          { buttonId: 'btn_main_menu', buttonText: { displayText: '🔙 Main Menu' } },
          { buttonId: 'btn_stop_bot', buttonText: { displayText: '🛑 Stop Bot' } }
        ],
        'ZestEat Live Support',
        'We are here to help you 24/7'
      );
    } catch (err) {
      sentMessageResult = await sendTextMessage(cleanP, responseSentText);
    }
  }

  // ── 8. CATCH-ALL FALLBACK FOR UNHANDLED INPUT ──────────────────────────────
  else {
    session.state = 'MAIN';
    userSessions.set(cleanP, session);

    responseSentText = `Hello ${userName}! 👋 Welcome to *ZestEat Enterprise Automation*.\n\n` +
      `We received your message: "${text}".\n\n` +
      `Please select an option below:`;

    try {
      sentMessageResult = await sendButtons(
        cleanP,
        responseSentText,
        [
          { buttonId: 'btn_order', buttonText: { displayText: '📦 Order' } },
          { buttonId: 'btn_feedback', buttonText: { displayText: '⭐ Feedback' } },
          { buttonId: 'btn_stop_bot', buttonText: { displayText: '🛑 Stop Bot' } }
        ],
        'ZestEat Automated Menu',
        'Select Order, Feedback or Stop Conversation'
      );
    } catch (err) {
      sentMessageResult = await sendTextMessage(
        cleanP,
        `*ZestEat Automation Menu*\n\n${responseSentText}\n\n1️⃣ *Order*\n2️⃣ *Feedback*\n3️⃣ *Stop Conversation* (Reply STOP)`
      );
    }
  }

  // Record AutoReply in MongoDB MessageLog and emit via WebSockets
  if (responseSentText) {
    try {
      const replyWamid = sentMessageResult?.messages?.[0]?.id || `reply_${Date.now()}`;
      
      const autoReplyLog = await MessageLog.create({
        wamid: replyWamid,
        phone: cleanP,
        direction: 'OUTGOING',
        status: 'sent',
        text: responseSentText,
        senderName: 'ZestEat AutoBot',
        isAutoReply: true,
        timestamp: new Date(),
        phoneId: incomingPhoneId,
        wabaId: incomingWabaId
      });

      if (io) {
        io.emit('auto_reply', autoReplyLog);
        console.log(`🤖 [ZESTEAT BOT AUTOMATION EMITTED] to ${cleanP} (State: ${session.state})`);
      }
    } catch (dbErr) {
      console.error('Failed to log ZestEat bot response:', dbErr.message);
    }
  }
};

module.exports = {
  handleZestEatAutomation
};
