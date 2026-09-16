require('dotenv').config();
require('express-async-errors');
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const mongoose = require('mongoose');
const path     = require('path');
const cron     = require('node-cron');

const app = express();
const server = http.createServer(app);

// ── WebSockets (Socket.io) ────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log(`⚡ [WEBSOCKET] Client connected: ${socket.id}`);

  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`📡 [WEBSOCKET] Client ${socket.id} joined room: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 [WEBSOCKET] Client disconnected: ${socket.id}`);
  });
});

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/users',     require('./routes/users'));
app.use('/api/leads',     require('./routes/leads'));
app.use('/api/whatsapp',  require('./routes/whatsapp'));
app.use('/api/integrations/whatsapp', require('./routes/whatsapp'));
app.use('/api/contacts',  require('./routes/contacts'));
app.use('/api/template',  require('./routes/template'));
app.use('/api/integrations/whatsapp/templates', require('./routes/template'));
app.use('/api/orders',    require('./routes/orders'));
app.use('/api/menu',      require('./routes/menu'));
app.use('/api/todos',     require('./routes/todos'));
app.use('/api/paysip',    require('./routes/paysip'));
app.use('/api/analytics', require('./routes/analytics'));

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message });
});

// ── MongoDB + startup ─────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mutton_chicken_shop')
  .then(async () => {
    console.log('✅ MongoDB connected');

    // Cron: run scheduled broadcasts every minute
    const { runScheduledTemplates } = require('./routes/template');
    cron.schedule('* * * * *', async () => {
      try { await runScheduledTemplates(); }
      catch (e) { console.error('Scheduler error:', e.message); }
    });
    console.log('⏰ Broadcast scheduler started');
  })
  .catch(err => console.error('❌ MongoDB error:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running with WebSockets on port ${PORT}`));

module.exports = { app, server, io };