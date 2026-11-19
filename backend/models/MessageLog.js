const mongoose = require('mongoose');

const messageLogSchema = new mongoose.Schema({
  wamid:          { type: String, required: true, unique: true },
  phone:          { type: String, required: true },
  direction:      { type: String, enum: ['OUTGOING', 'INCOMING'], default: 'OUTGOING' },
  status:         { type: String, required: true }, // sent, delivered, read, failed, received
  text:           { type: String, default: '' },
  senderName:     { type: String, default: '' },
  templateName:   { type: String, default: '' },
  headerImageUrl: { type: String, default: '' },
  buttons:        { type: Array, default: [] },
  timestamp:      { type: Date, required: true },
  errorCode:      { type: Number, default: null },
  errorMessage:   { type: String, default: null },
  pricing:        { type: Object, default: null },
  // `conversation.origin.type` from the status webhook. `marketing_lite` means the
  // message went out through the Marketing Messages API for WhatsApp.
  conversationOrigin: { type: String, default: null },
  phoneId:        { type: String, default: null },
  wabaId:         { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('MessageLog', messageLogSchema);
