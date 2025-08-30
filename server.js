const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// إعداد Socket.IO للعمل عبر الإنترنت
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

// إعداد Express للعمل عبر الإنترنت
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// تقديم الملفات الثابتة (HTML, CSS, JS)
app.use(express.static("public"));

// قائمة المستخدمين المتصلين
let connectedUsers = {};

// قائمة روابط الدعوة النشطة
let inviteLinks = {};

// دالة لإنشاء رابط دعوة فريد
function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("👤 مستخدم متصل:", socket.id);
  
  // إضافة المستخدم إلى القائمة
  connectedUsers[socket.id] = {
    id: socket.id,
    joinTime: new Date(),
    isTyping: false
  };
  
  // إرسال قائمة المستخدمين المتصلين للجميع
  io.emit("users-update", Object.keys(connectedUsers));

  // استقبال وإرسال الرسائل النصية
  socket.on("chat-message", (msg) => {
    const messageData = {
      id: socket.id,
      text: msg,
      timestamp: new Date().toLocaleTimeString('ar-SA')
    };
    io.emit("chat-message", messageData);
    console.log(`💬 رسالة من ${socket.id}: ${msg}`);
  });

  // WebRTC Signaling (العرض/الجواب/ICE)
  socket.on("offer", (data) => {
    console.log(`📞 عرض مكالمة من ${socket.id} إلى ${data.to}`);
    
    if (data.to === "all") {
      // إرسال للجميع ما عدا المرسل
      socket.broadcast.emit("offer", { 
        from: socket.id, 
        sdp: data.sdp 
      });
      console.log(`📤 تم إرسال العرض للجميع`);
    } else {
      // إرسال لمستخدم محدد
      socket.to(data.to).emit("offer", { 
        from: socket.id, 
        sdp: data.sdp 
      });
      console.log(`📤 تم إرسال العرض إلى ${data.to}`);
    }
  });

  socket.on("answer", (data) => {
    console.log(`✅ رد على المكالمة من ${socket.id} إلى ${data.to}`);
    socket.to(data.to).emit("answer", { 
      from: socket.id, 
      sdp: data.sdp 
    });
  });

  socket.on("ice-candidate", (data) => {
    console.log(`🧊 ICE candidate من ${socket.id} إلى ${data.to}`);
    
    if (data.to === "all") {
      // إرسال للجميع ما عدا المرسل
      socket.broadcast.emit("ice-candidate", { 
        from: socket.id, 
        candidate: data.candidate 
      });
    } else {
      // إرسال لمستخدم محدد
      socket.to(data.to).emit("ice-candidate", { 
        from: socket.id, 
        candidate: data.candidate 
      });
    }
  });

  // إنهاء المكالمة
  socket.on("end-call", (data) => {
    socket.to(data.to).emit("call-ended", { from: socket.id });
  });

  // إنشاء رابط دعوة
  socket.on("create-invite", (data) => {
    const inviteCode = generateInviteCode();
    const inviteData = {
      code: inviteCode,
      createdBy: socket.id,
      createdAt: new Date(),
      familyName: data.familyName || 'العائلة',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // ينتهي خلال 24 ساعة
    };
    
    inviteLinks[inviteCode] = inviteData;
    
    // إنشاء رابط يعمل عبر الإنترنت
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? (process.env.RENDER_EXTERNAL_URL || data.baseUrl || 'https://your-app-name.onrender.com')
      : (data.baseUrl || `http://localhost:${server.address()?.port || 3000}`);
    
    const inviteUrl = `${baseUrl}?invite=${inviteCode}`;
    
    socket.emit("invite-created", {
      code: inviteCode,
      url: inviteUrl,
      familyName: inviteData.familyName,
      expiresAt: inviteData.expiresAt,
      localUrl: inviteUrl, // نفس الرابط للكمبيوتر والجوال في الإنتاج
      mobileUrl: inviteUrl
    });
    
    console.log(`🔗 تم إنشاء رابط دعوة: ${inviteCode} للعائلة: ${inviteData.familyName}`);
    console.log(`📱 رابط الجوال: ${inviteUrl}`);
  });

  // التحقق من صحة رابط الدعوة
  socket.on("validate-invite", (inviteCode) => {
    const invite = inviteLinks[inviteCode];
    
    if (!invite) {
      socket.emit("invite-invalid", { message: "رابط الدعوة غير صحيح" });
      return;
    }
    
    if (new Date() > invite.expiresAt) {
      delete inviteLinks[inviteCode];
      socket.emit("invite-invalid", { message: "رابط الدعوة منتهي الصلاحية" });
      return;
    }
    
    socket.emit("invite-valid", {
      familyName: invite.familyName,
      createdAt: invite.createdAt
    });
    
    console.log(`✅ مستخدم دخل عبر رابط دعوة صحيح: ${inviteCode}`);
  });

  // قطع الاتصال
  socket.on("disconnect", () => {
    console.log("❌ مستخدم خرج:", socket.id);
    delete connectedUsers[socket.id];
    io.emit("user-disconnected", socket.id);
    io.emit("users-update", Object.keys(connectedUsers));
  });
});

const PORT = process.env.PORT || 3000;

// دالة للحصول على عنوان IP المحلي (للتطوير المحلي)
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // تجاهل العناوين الداخلية وغير IPv4
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// إضافة route للصحة (مطلوب لخدمات الاستضافة)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    users: Object.keys(connectedUsers).length,
    invites: Object.keys(inviteLinks).length
  });
});

// دالة بدء الخادم المحسنة
function startServer(port) {
  const isProduction = process.env.NODE_ENV === 'production';
  const host = isProduction ? '0.0.0.0' : '0.0.0.0'; // الاستماع على جميع العناوين
  
  const serverInstance = server.listen(port, host)
    .on('listening', () => {
      const address = serverInstance.address();
      const actualPort = address.port;
      
      console.log(`🚀 خادم العائلة يعمل بنجاح!`);
      console.log(`🌍 البيئة: ${isProduction ? 'الإنتاج (عبر الإنترنت)' : 'التطوير (محلي)'}`);
      
      if (isProduction) {
        console.log(`🌐 الرابط العام: ${process.env.RENDER_EXTERNAL_URL || 'https://your-app-name.onrender.com'}`);
        console.log(`📡 يمكن الوصول إليه من أي مكان في العالم!`);
      } else {
        const localIP = getLocalIP();
        console.log(`📍 محلياً: http://localhost:${actualPort}`);
        console.log(`🏠 الشبكة المحلية: http://${localIP}:${actualPort}`);
        console.log(`📱 للهاتف الجوال: http://${localIP}:${actualPort}`);
      }
      
      console.log(`👥 المستخدمين المتصلين: ${Object.keys(connectedUsers).length}`);
      console.log(`🔗 روابط الدعوة النشطة: ${Object.keys(inviteLinks).length}`);
      console.log("✅ جاهز لاستقبال الاتصالات من جميع أنحاء العالم!");
    })
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ المنفذ ${port} مستخدم، جاري المحاولة مع المنفذ ${port + 1}...`);
        startServer(port + 1);
      } else {
        console.error('❌ خطأ في تشغيل الخادم:', err);
        process.exit(1);
      }
    });
}

// تنظيف روابط الدعوة المنتهية الصلاحية كل ساعة
setInterval(() => {
  const now = new Date();
  let expiredCount = 0;
  
  for (const [code, data] of Object.entries(inviteLinks)) {
    if (data.expiresAt < now) {
      delete inviteLinks[code];
      expiredCount++;
    }
  }
  
  if (expiredCount > 0) {
    console.log(`🧹 تم حذف ${expiredCount} رابط دعوة منتهي الصلاحية`);
  }
}, 60 * 60 * 1000); // كل ساعة

startServer(PORT);
