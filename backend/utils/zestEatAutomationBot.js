const { sendTextMessage, sendButtons, sendListMenu } = require('./whatsappService');
const MessageLog = require('../models/MessageLog');

// In-memory conversation state map for active sessions
const userSessions = new Map();

/**
 * ZestEat WhatsApp Automation Bot Handler
 * Exactly implements ZestEat_WhatsApp_Automated_Templates_Chart flow
 */
const handleZestEatAutomation = async ({ phone, text, payload, senderName, incomingPhoneId, incomingWabaId, io }) => {
  const cleanP = String(phone).replace(/\D/g, '');
  const rawInput = (payload || text || '').toLowerCase().trim();
  const userName = senderName || 'Customer';

  // Session state getter/setter
  let session = userSessions.get(cleanP) || { state: 'MAIN', lastItem: '' };

  let responseSentText = '';
  let sentMessageResult = null;

  // ── ROUTING LOGIC ─────────────────────────────────────────────────────────

  // 1. Reset / Main Menu trigger
  if (['main_menu', 'btn_main_menu', 'hi', 'hello', 'start', 'menu', 'reset'].some(k => rawInput === k)) {
    session.state = 'MAIN';
    userSessions.set(cleanP, session);

    responseSentText = `Hello ${userName}! 👋 Welcome to *ZestEat Enterprise Automation*.\n\nPlease select an option to get started:`;
    
    try {
      sentMessageResult = await sendButtons(
        cleanP,
        responseSentText,
        [
          { buttonId: 'btn_order', buttonText: { displayText: '📦 Order' } },
          { buttonId: 'btn_feedback', buttonText: { displayText: '⭐ Feedback' } }
        ],
        'ZestEat Main Menu',
        'Select Order or Feedback to proceed'
      );
    } catch (err) {
      console.warn('Interactive button fallback to text for Main Menu:', err.message);
      sentMessageResult = await sendTextMessage(
        cleanP,
        `*ZestEat Main Menu*\n\n${responseSentText}\n\n1️⃣ *Order* (Reply 1)\n2️⃣ *Feedback* (Reply 2)`
      );
    }
  }

  // 2. Main Option Selection: ORDER
  else if (rawInput === 'btn_order' || rawInput === 'order' || (session.state === 'MAIN' && (rawInput === '1' || rawInput === '1. order'))) {
    session.state = 'ORDER_MENU';
    userSessions.set(cleanP, session);

    responseSentText = `📦 *ZestEat Order Categories*\n\nPlease select an order subcategory below:`;

    try {
      sentMessageResult = await sendButtons(
        cleanP,
        responseSentText,
        [
          { buttonId: 'btn_food', buttonText: { displayText: '🍕 Food' } },
          { buttonId: 'btn_meat', buttonText: { displayText: '🥩 Meat' } },
          { buttonId: 'btn_zesteat_market', buttonText: { displayText: '🏪 ZestEat Market' } }
        ],
        'Order Categories',
        'Choose Food, Meat or ZestEat Market'
      );
    } catch (err) {
      sentMessageResult = await sendTextMessage(
        cleanP,
        `*ZestEat Order Categories*\n\n${responseSentText}\n\n1️⃣ *Food*\n2️⃣ *Meat*\n3️⃣ *ZestEat Market*\n\n_Reply 1, 2, or 3_`
      );
    }
  }

  // 3. Sub-Category: MEAT MENU (Chicken, Mutton, Fish, Seafood)
  else if (rawInput === 'btn_meat' || rawInput === 'meat' || (session.state === 'ORDER_MENU' && (rawInput === '2' || rawInput === '2. meat'))) {
    session.state = 'MEAT_MENU';
    userSessions.set(cleanP, session);

    responseSentText = `🥩 *ZestEat Meat Selection*\n\nPlease select a meat category:`;

    try {
      sentMessageResult = await sendListMenu(cleanP, {
        title: 'ZestEat Meat Categories 🥩',
        description: 'Choose your preferred meat product below:',
        buttonText: 'Select Meat Item',
        footer: 'ZestEat Fresh Meat Quality Guaranteed',
        sections: [
          {
            title: 'Meat Subcategories',
            rows: [
              { rowId: 'btn_meat_chicken', title: '🍗 Chicken', description: 'Fresh farm-raised chicken' },
              { rowId: 'btn_meat_mutton', title: '🍖 Mutton', description: 'Tender goat & lamb mutton' },
              { rowId: 'btn_meat_fish', title: '🐟 Fish', description: 'Fresh river & sea fish' },
              { rowId: 'btn_meat_seafood', title: '🦐 Other Seafood', description: 'Prawns, crabs & seafood' }
            ]
          }
        ]
      });
    } catch (err) {
      sentMessageResult = await sendTextMessage(
        cleanP,
        `🥩 *ZestEat Meat Selection*\n\n1️⃣ *Chicken*\n2️⃣ *Mutton*\n3️⃣ *Fish*\n4️⃣ *Other Seafood*\n\n_Reply 1, 2, 3, or 4_`
      );
    }
  }

  // 4. Sub-Category: FOOD, ZESTEAT MARKET, or specific MEAT items (Chicken / Mutton / Fish / Seafood)
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
          { buttonId: 'btn_main_menu', buttonText: { displayText: '🔙 Main Menu' } }
        ],
        `ZestEat ${selectedName} Assistance`,
        'Need more help? Click Live Chat or Main Menu'
      );
    } catch (err) {
      sentMessageResult = await sendTextMessage(
        cleanP,
        responseSentText + `\n\n_Reply *LIVE CHAT* for support or *MENU* for main menu._`
      );
    }
  }

  // 5. Main Option Selection: FEEDBACK
  else if (rawInput === 'btn_feedback' || rawInput === 'feedback' || (session.state === 'MAIN' && (rawInput === '2' || rawInput === '2. feedback'))) {
    session.state = 'FEEDBACK_VIEW';
    userSessions.set(cleanP, session);

    responseSentText = `⭐ *ZestEat Order & Feedback Assistance*\n\n` +
      `1️⃣ *How was your ZestEat order?*\n` +
      `👉 Please share your experience with us.\n\n` +
      `2️⃣ *How would you rate your food?*\n` +
      `👉 Your feedback helps us improve our food quality.\n\n` +
      `3️⃣ *How would you rate your delivery experience?*\n` +
      `👉 Please share your delivery experience with us.\n\n` +
      `4️⃣ *Do you have any feedback or suggestions?*\n` +
      `👉 We value your feedback and suggestions.\n\n` +
      `5️⃣ *Live chat*\n` +
      `👉 Connect with our support team for assistance.`;

    try {
      sentMessageResult = await sendButtons(
        cleanP,
        responseSentText,
        [
          { buttonId: 'btn_live_chat', buttonText: { displayText: '💬 Live Chat' } },
          { buttonId: 'btn_main_menu', buttonText: { displayText: '🔙 Main Menu' } }
        ],
        'ZestEat Feedback Options',
        'Select Live Chat or Main Menu'
      );
    } catch (err) {
      sentMessageResult = await sendTextMessage(
        cleanP,
        responseSentText + `\n\n_Reply *LIVE CHAT* for support or *MENU* for main menu._`
      );
    }
  }

  // 6. Support & Live Chat Connection
  else if (rawInput === 'btn_live_chat' || rawInput === 'live chat' || rawInput === 'chat' || rawInput === 'support' || (['FAQ_VIEW', 'FEEDBACK_VIEW'].includes(session.state) && (rawInput === '4' || rawInput === '5'))) {
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
          { buttonId: 'btn_main_menu', buttonText: { displayText: '🔙 Main Menu' } }
        ],
        'ZestEat Live Support',
        'We are here to help you 24/7'
      );
    } catch (err) {
      sentMessageResult = await sendTextMessage(cleanP, responseSentText);
    }
  }

  // 7. Catch-all / Fallback for unhandled input -> Send Main Menu
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
          { buttonId: 'btn_feedback', buttonText: { displayText: '⭐ Feedback' } }
        ],
        'ZestEat Automated Menu',
        'Select Order or Feedback to proceed'
      );
    } catch (err) {
      sentMessageResult = await sendTextMessage(
        cleanP,
        `*ZestEat Automation Menu*\n\n${responseSentText}\n\n1️⃣ *Order*\n2️⃣ *Feedback*`
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
