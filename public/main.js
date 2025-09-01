// === وظائف مساعدة لإدارة الفئات ===
function hideElement(element) {
  if (element) {
    element.classList.add('hidden');
    element.classList.remove('visible', 'flex-visible', 'inline-visible', 'inline-flex-visible');
  }
}

function showElement(element, displayType = 'block') {
  if (element) {
    element.classList.remove('hidden');
    switch(displayType) {
      case 'flex':
        element.classList.add('flex-visible');
        break;
      case 'inline':
        element.classList.add('inline-visible');
        break;
      case 'inline-flex':
        element.classList.add('inline-flex-visible');
        break;
      default:
        element.classList.add('visible');
    }
  }
}

function isElementVisible(element) {
  return element && !element.classList.contains('hidden');
}

// === Polyfills للمتصفحات القديمة ===
// إضافة دعم getUserMedia للمتصفحات القديمة
(function() {
  // إنشاء navigator.mediaDevices إذا لم يكن موجوداً
  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {};
  }
  
  // إضافة getUserMedia إذا لم تكن موجودة
  if (!navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia = function(constraints) {
      const getUserMedia = navigator.getUserMedia || 
                         navigator.webkitGetUserMedia || 
                         navigator.mozGetUserMedia ||
                         navigator.msGetUserMedia;
      
      if (!getUserMedia) {
        return Promise.reject(new Error('getUserMedia غير مدعوم في هذا المتصفح'));
      }
      
      return new Promise((resolve, reject) => {
        getUserMedia.call(navigator, constraints, resolve, reject);
      });
    };
  }
  
  // إضافة enumerateDevices إذا لم تكن موجودة
  if (!navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices = function() {
      return Promise.resolve([]);
    };
  }
  

})();

// إعدادات الاتصال - يعمل محلياً وعبر الإنترنت
const socket = io({
  transports: ['websocket', 'polling'],
  timeout: 20000,
  forceNew: true
});
let localStream;
let peerConnection;
let isCallActive = false;
let isVideoCall = true;

// متغيرات جديدة للميزات المحسنة
let currentTheme = localStorage.getItem('theme') || 'light';
let isTyping = false;
let typingTimeout = null;
let callStartTime = null;
let callTimerInterval = null;

// متغيرات غرف الدردشة المتعددة
let currentRoom = 'general';
let availableRooms = {
  'general': {
    name: 'الغرفة العامة',
    icon: '🏠',
    description: 'للمحادثات العامة',
    members: 0,
    isPrivate: false
  }
};
let selectedFiles = [];
let maxFileSize = 10 * 1024 * 1024; // 10 ميجابايت

// إعدادات WebRTC محسنة للعمل عبر الإنترنت
const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    // خوادم TURN مجانية للاتصالات عبر NAT
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject", 
      credential: "openrelayproject"
    }
  ],
  iceCandidatePoolSize: 10
};

// عناصر DOM
const messages = document.getElementById("messages");
const msgBox = document.getElementById("msgBox");
const sendBtn = document.getElementById("sendBtn");
const connectionStatus = document.getElementById("connectionStatus");
const userCount = document.getElementById("userCount");
const usersList = document.getElementById("usersList");
const callStatus = document.getElementById("callStatus");
const startCallBtn = document.getElementById("startCallBtn");
const startAudioBtn = document.getElementById("startAudioBtn");
const endCallBtn = document.getElementById("endCallBtn");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// عناصر الدعوة (سيتم تعريفها عند تحميل الصفحة)
let welcomeScreen, mainApp, welcomeMessage, guestNameInput, familyNameInput;
let inviteResult, mobileInviteLinkText, localInviteLinkText;

// متغيرات الدعوة
let currentMobileInviteLink = '';
let currentLocalInviteLink = '';
let guestName = '';
let familyName = '';

// متغيرات التحسينات الجديدة (تم نقلها من الأعلى لتجنب التكرار)

// تسجيل Service Worker للـ PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('✅ Service Worker مسجل بنجاح:', registration.scope);
      })
      .catch(error => {
        console.log('❌ فشل تسجيل Service Worker:', error);
      });
  });
}

// تهيئة التطبيق عند التحميل
document.addEventListener('DOMContentLoaded', function() {
  // تعريف عناصر الدعوة
  welcomeScreen = document.getElementById("welcomeScreen");
  mainApp = document.getElementById("mainApp");
  welcomeMessage = document.getElementById("welcomeMessage");
  guestNameInput = document.getElementById("guestNameInput");
  familyNameInput = document.getElementById("familyNameInput");
  inviteResult = document.getElementById("inviteResult");
  
  // تفعيل الصوت عند أول تفاعل
  document.addEventListener('click', enableAudio, { once: true });
  document.addEventListener('keydown', enableAudio, { once: true });
  document.addEventListener('touchstart', enableAudio, { once: true });
  mobileInviteLinkText = document.getElementById("mobileInviteLinkText");
  localInviteLinkText = document.getElementById("localInviteLinkText");
  
  // تطبيق الوضع المحفوظ
  applyTheme(currentTheme);
  
  // تحميل إعداد انعكاس الفيديو المحفوظ
  const savedFlipSetting = localStorage.getItem('videoFlipped');
  if (savedFlipSetting !== null) {
    isVideoFlipped = savedFlipSetting === 'true';
  }
  
  // إخفاء الإيموجي بيكر عند النقر خارجه
  document.addEventListener('click', function(e) {
    const emojiPicker = document.getElementById('emojiPicker');
    const emojiToggle = document.querySelector('.emoji-toggle');
    
    if (emojiPicker && !emojiPicker.contains(e.target) && !emojiToggle.contains(e.target)) {
      emojiPicker.classList.remove('show');
    }
  });
  
  // التحقق من وجود رابط دعوة في الرابط
  const urlParams = new URLSearchParams(window.location.search);
  const inviteCode = urlParams.get('invite');
  
  if (inviteCode) {
    // إظهار شاشة الترحيب للمدعوين
    showWelcomeScreen(inviteCode);
  } else {
    // إظهار التطبيق العادي
    showMainApp();
  }
  
  // إضافة مستمع للضغط على Enter في صندوق الرسائل
  msgBox.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // إضافة مستمع للكتابة
  msgBox.addEventListener('input', function() {
    handleTyping();
    autoResizeTextarea(this);
  });
  
  // إضافة مستمع للضغط على Enter في اسم الضيف
  if (guestNameInput) {
    guestNameInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        joinFamily();
      }
    });
  }
  
  // إغلاق الإيموجي بيكر عند النقر خارجه
  document.addEventListener('click', function(e) {
    const emojiPicker = document.getElementById('emojiPicker');
    const emojiToggle = document.querySelector('.emoji-toggle');
    
    if (!emojiPicker.contains(e.target) && !emojiToggle.contains(e.target)) {
      emojiPicker.classList.remove('show');
    }
  });
  
  // تعطيل أزرار المكالمة في البداية
  updateCallButtons(false);
});

// === وظائف الاتصال والحالة ===
socket.on('connect', () => {
  console.log('✅ متصل بالخادم');
  connectionStatus.textContent = '🟢 متصل';
  connectionStatus.className = 'connected';
  updateCallButtons(false);
});

socket.on('disconnect', () => {
  console.log('❌ انقطع الاتصال');
  connectionStatus.textContent = '🔴 غير متصل';
  connectionStatus.className = 'disconnected';
  updateCallButtons(false);
  if (isCallActive) {
    updateCallStatus('انقطع الاتصال بالخادم...', 'warning');
  }
});

// معالجة إعادة الاتصال
socket.on('reconnect', () => {
  console.log('🔄 تم إعادة الاتصال بالخادم');
  connectionStatus.textContent = '🟢 متصل';
  connectionStatus.className = 'connected';
  if (isCallActive) {
    updateCallStatus('تم استعادة الاتصال', 'connected');
  }
});

// تحديث قائمة المستخدمين
let previousUserCount = 0;
socket.on('users-update', (users) => {
  const count = users.length;
  userCount.textContent = `المتصلين: ${count}`;
  
  // تشغيل أصوات الانضمام/المغادرة
  if (previousUserCount > 0) { // تجنب الصوت عند التحميل الأول
    if (count > previousUserCount) {
      // عضو جديد انضم
      try {
        playJoinSound();
        showCopyNotification('🎉 انضم عضو جديد للعائلة!');
      } catch (error) {
        console.log('لا يمكن تشغيل صوت الانضمام:', error);
      }
    } else if (count < previousUserCount) {
      // عضو غادر
      try {
        playLeaveSound();
        showCopyNotification('👋 غادر أحد الأعضاء');
      } catch (error) {
        console.log('لا يمكن تشغيل صوت المغادرة:', error);
      }
    }
  }
  previousUserCount = count;
  
  usersList.innerHTML = '';
  users.forEach((user, index) => {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    
    // استخدام الاسم الحقيقي إذا كان متوفراً
    let displayName;
    if (typeof user === 'object' && user.name) {
      displayName = user.id === socket.id ? `أنت (${user.name})` : user.name;
    } else {
      const userId = typeof user === 'object' ? user.id : user;
      displayName = userId === socket.id ? 'أنت' : `عضو العائلة ${index + 1}`;
    }
    
    userElement.textContent = displayName;
    usersList.appendChild(userElement);
  });
  
  // تحديث أسماء الفيديوهات
  updateVideoLabels(users);
  
  // تمكين أزرار المكالمة إذا كان هناك أكثر من مستخدم
  updateCallButtons(count > 1 && !isCallActive);
});

// تحديث أسماء الفيديوهات
function updateVideoLabels(users) {
  const localVideoLabel = document.querySelector('#localVideo + label');
  const remoteVideoLabel = document.querySelector('#remoteVideo + label');
  
  if (localVideoLabel) {
    const currentUser = users.find(user => {
      const userId = typeof user === 'object' ? user.id : user;
      return userId === socket.id;
    });
    
    if (currentUser && typeof currentUser === 'object' && currentUser.name) {
      localVideoLabel.textContent = `أنت (${currentUser.name})`;
    } else {
      localVideoLabel.textContent = 'أنت';
    }
  }
  
  if (remoteVideoLabel && users.length > 1) {
    const otherUser = users.find(user => {
      const userId = typeof user === 'object' ? user.id : user;
      return userId !== socket.id;
    });
    
    if (otherUser) {
      if (typeof otherUser === 'object' && otherUser.name) {
        remoteVideoLabel.textContent = otherUser.name;
      } else {
        remoteVideoLabel.textContent = 'عضو العائلة';
      }
    }
  }
}

// === وظائف الرسائل النصية ===
function sendMessage() {
  const msg = msgBox.value.trim();
  if (msg) {
    socket.emit("chat-message", msg);
    msgBox.value = "";
    msgBox.focus();
  }
}

// إعداد الإرسال بـ Enter
document.addEventListener('DOMContentLoaded', function() {
  const msgBox = document.getElementById('msgBox');
  if (msgBox) {
    msgBox.addEventListener('keypress', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    
    // إضافة تلميح للمستخدم
    msgBox.placeholder = 'اكتب رسالة للعائلة... (اضغط Enter للإرسال)';
  }
});

socket.on("chat-message", (data) => {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message fade-in";
  messageDiv.setAttribute('data-message-id', data.messageId || Date.now());
  
  const isOwnMessage = data.id === socket.id;
  const senderName = isOwnMessage ? 'أنت' : `مستخدم ${data.id.substring(0, 6)}`;
  
  // إضافة أزرار التحكم للرسائل الخاصة بالمستخدم
  const messageControls = isOwnMessage ? `
    <div class="message-controls">
      <button class="edit-message-btn" onclick="editMessage('${data.messageId || Date.now()}', this)" title="تعديل الرسالة">✏️</button>
      <button class="delete-message-btn" onclick="deleteMessage('${data.messageId || Date.now()}', this)" title="حذف الرسالة">🗑️</button>
    </div>
  ` : '';
  
  messageDiv.innerHTML = `
    <div class="sender">${senderName}</div>
    <div class="text" data-original-text="${escapeHtml(data.text)}">${escapeHtml(data.text)}</div>
    <div class="time">${data.timestamp}</div>
    ${messageControls}
  `;
  
  messages.appendChild(messageDiv);
  messages.scrollTop = messages.scrollHeight;
  
  // تشغيل صوت للرسائل الواردة فقط (ليس للرسائل المرسلة)
  if (!isOwnMessage) {
    try {
      playNotificationSound();
    } catch (error) {
      console.log('لا يمكن تشغيل الصوت:', error);
    }
  }
});

// === وظائف مكالمات الفيديو ===
async function startCall() {
  if (isCallActive) {
    console.log('⚠️ المكالمة نشطة بالفعل');
    return;
  }
  
  // منع إنشاء اتصالات متعددة
  if (peerConnection && peerConnection.connectionState !== 'closed') {
    console.log('🔄 إغلاق الاتصال السابق قبل بدء مكالمة جديدة');
    endCall();
    // انتظار قصير للتأكد من التنظيف
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  isVideoCall = true;
  await initializeCall();
  
  // بدء المؤقت عند بدء المكالمة
  if (isCallActive) {
    startCallTimer();
    updateConnectionQuality('excellent'); // افتراضي
  }
}

async function startAudioCall() {
  if (isCallActive) {
    console.log('⚠️ المكالمة نشطة بالفعل');
    return;
  }
  
  // منع إنشاء اتصالات متعددة
  if (peerConnection && peerConnection.connectionState !== 'closed') {
    console.log('🔄 إغلاق الاتصال السابق قبل بدء مكالمة جديدة');
    endCall();
    // انتظار قصير للتأكد من التنظيف
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  isVideoCall = false;
  await initializeCall();
  
  // بدء المؤقت عند بدء المكالمة
  if (isCallActive) {
    startCallTimer();
    updateConnectionQuality('excellent'); // افتراضي
  }
}

// مشاركة الشاشة
async function startScreenShare() {
  if (!isCallActive) {
    showNotification('يجب بدء مكالمة أولاً لمشاركة الشاشة', 'error');
    return;
  }
  
  try {
    // التحقق من دعم مشاركة الشاشة
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('مشاركة الشاشة غير مدعومة في هذا المتصفح');
    }
    
    // الحصول على تدفق الشاشة
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    
    // استبدال تدفق الفيديو الحالي بتدفق الشاشة
    const videoTrack = screenStream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find(s => 
      s.track && s.track.kind === 'video'
    );
    
    if (sender) {
      await sender.replaceTrack(videoTrack);
    }
    
    // تحديث الفيديو المحلي
    localVideo.srcObject = screenStream;
    
    // تحديث مؤشرات الحالة
    updateMediaStatus();
    const screenStatus = document.getElementById('screenStatus');
    if (screenStatus) {
      showElement(screenStatus, 'inline-flex');
      screenStatus.classList.add('active');
    }
    
    // معالجة إنهاء مشاركة الشاشة
    videoTrack.onended = async () => {
      await stopScreenShare();
    };
    
    showNotification('تم بدء مشاركة الشاشة', 'success');
    console.log('🖥️ تم بدء مشاركة الشاشة');
    
  } catch (error) {
    console.error('خطأ في مشاركة الشاشة:', error);
    showNotification('فشل في مشاركة الشاشة', 'error');
  }
}

// إيقاف مشاركة الشاشة
async function stopScreenShare() {
  try {
    // العودة للكاميرا العادية
    const stream = await navigator.mediaDevices.getUserMedia({
      video: isVideoCall,
      audio: true
    });
    
    const videoTrack = stream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find(s => 
      s.track && s.track.kind === 'video'
    );
    
    if (sender && videoTrack) {
      await sender.replaceTrack(videoTrack);
    }
    
    // تحديث الفيديو المحلي
    localVideo.srcObject = stream;
    
    // تحديث مؤشرات الحالة
    updateMediaStatus();
    const screenStatus = document.getElementById('screenStatus');
    if (screenStatus) {
      hideElement(screenStatus);
      screenStatus.classList.remove('active');
    }
    
    showNotification('تم إيقاف مشاركة الشاشة', 'info');
    console.log('🖥️ تم إيقاف مشاركة الشاشة');
    
  } catch (error) {
    console.error('خطأ في إيقاف مشاركة الشاشة:', error);
  }
}

// تحديث مؤشرات حالة الوسائط
function updateMediaStatus() {
  const mediaStatus = document.getElementById('mediaStatus');
  const micStatus = document.getElementById('micStatus');
  const cameraStatus = document.getElementById('cameraStatus');
  const screenShareBtn = document.getElementById('screenShareBtn');
  
  if (!isCallActive) {
    hideElement(mediaStatus);
    hideElement(screenShareBtn);
    return;
  }
  
  showElement(mediaStatus);
  showElement(screenShareBtn, 'inline-block');
  
  // تحديث حالة الميكروفون
  if (micStatus) {
    const stream = localVideo.srcObject;
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack && audioTrack.enabled) {
        micStatus.classList.remove('muted', 'disabled');
        micStatus.classList.add('active');
        micStatus.querySelector('.status-text').textContent = 'مفعل';
      } else {
        micStatus.classList.remove('active');
        micStatus.classList.add('muted');
        micStatus.querySelector('.status-text').textContent = 'مكتوم';
      }
    }
  }
  
  // تحديث حالة الكاميرا
  if (cameraStatus) {
    const stream = localVideo.srcObject;
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && videoTrack.enabled) {
        cameraStatus.classList.remove('muted', 'disabled');
        cameraStatus.classList.add('active');
        cameraStatus.querySelector('.status-text').textContent = 'مفعل';
      } else {
        cameraStatus.classList.remove('active');
        cameraStatus.classList.add('disabled');
        cameraStatus.querySelector('.status-text').textContent = 'معطل';
      }
    }
  }
}

async function initializeCall() {
  try {
    updateCallStatus('جاري بدء المكالمة...', 'calling');
    
    // التحقق من دعم getUserMedia (الـ polyfill تم تطبيقه في بداية الملف)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('الوصول للكاميرا والميكروفون غير مدعوم في هذا المتصفح');
    }
    
    // التحقق من الأمان (HTTPS أو localhost)
    const isSecure = location.protocol === 'https:' || 
                    location.hostname === 'localhost' || 
                    location.hostname === '127.0.0.1' ||
                    location.hostname.startsWith('192.168.') ||
                    location.hostname.startsWith('10.') ||
                    location.hostname.startsWith('172.');
    
    if (!isSecure) {
      console.warn('⚠️ الموقع غير آمن - قد تواجه مشاكل في الوصول للكاميرا والميكروفون');
    }
    
    // الحصول على إذن الوسائط مع إعدادات محسنة
    const constraints = {
      video: isVideoCall ? {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 60 }
      } : false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100
      }
    };
    
    console.log('🎥 طلب إذن الوسائط:', constraints);
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;
    
    // تشغيل الفيديو المحلي
    localVideo.muted = true; // كتم الصوت المحلي لتجنب التغذية الراجعة
    await localVideo.play();
    
    console.log('📹 تم الحصول على الوسائط المحلية:', localStream.getTracks());
    
    // إظهار أدوات التحكم في الكاميرا
    showCameraControls();
    
    // إظهار مؤشرات الحالة
    updateMediaStatus();
    
    // إنشاء اتصال WebRTC
    peerConnection = new RTCPeerConnection(config);
    
    // إضافة المسارات المحلية
    localStream.getTracks().forEach(track => {
      console.log('➕ إضافة مسار:', track.kind, track.enabled);
      peerConnection.addTrack(track, localStream);
    });
    
    // معالجة ICE candidates
    peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log('🧊 إرسال ICE candidate:', candidate.type);
        socket.emit("ice-candidate", { to: "all", candidate });
      }
    };
    
    // معالجة المسارات البعيدة
    peerConnection.ontrack = (event) => {
      console.log('📹 تم استلام مسار بعيد:', event.track.kind);
      const [remoteStream] = event.streams;
      
      // تأكد من عدم وجود مصدر سابق
      if (remoteVideo.srcObject !== remoteStream) {
        remoteVideo.srcObject = remoteStream;
        
        // انتظار قصير قبل التشغيل لتجنب التداخل
        setTimeout(() => {
          remoteVideo.play().then(() => {
            console.log('✅ تم تشغيل الفيديو البعيد بنجاح');
            updateCallStatus('المكالمة متصلة', 'connected');
          }).catch(err => {
            console.warn('⚠️ تحذير في تشغيل الفيديو البعيد:', err.message);
            // المحاولة مرة أخرى بعد وقت قصير
            setTimeout(() => {
              remoteVideo.play().catch(() => {
                console.log('ℹ️ الفيديو البعيد سيتم تشغيله تلقائياً');
              });
            }, 500);
          });
        }, 100);
      }
    };
    
    // معالجة تغيير حالة الاتصال
    peerConnection.onconnectionstatechange = () => {
      console.log('🔗 حالة الاتصال:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        isCallActive = true;
        showEndCallButton();
        updateCallStatus('المكالمة متصلة', 'connected');
      } else if (peerConnection.connectionState === 'disconnected' || 
                 peerConnection.connectionState === 'failed') {
        console.log('❌ فشل الاتصال، إنهاء المكالمة');
        endCall();
      }
    };
    
    // معالجة حالة ICE
    peerConnection.oniceconnectionstatechange = () => {
      console.log('🧊 حالة ICE:', peerConnection.iceConnectionState);
      
      if (peerConnection.iceConnectionState === 'connected' || 
          peerConnection.iceConnectionState === 'completed') {
        console.log('✅ تم تأسيس اتصال ICE بنجاح');
        updateCallStatus('المكالمة متصلة', 'connected');
        // إلغاء أي مؤقت انتظار سابق
        if (window.iceDisconnectTimeout) {
          clearTimeout(window.iceDisconnectTimeout);
          window.iceDisconnectTimeout = null;
        }
      } else if (peerConnection.iceConnectionState === 'disconnected') {
        console.log('⚠️ انقطع اتصال ICE مؤقتاً');
        updateCallStatus('إعادة الاتصال...', 'warning');
        
        // انتظار 15 ثانية قبل إنهاء المكالمة
        window.iceDisconnectTimeout = setTimeout(() => {
          if (peerConnection && peerConnection.iceConnectionState === 'disconnected') {
            console.log('⏰ انتهت مهلة إعادة الاتصال، إنهاء المكالمة');
            endCall();
          }
        }, 15000);
      } else if (peerConnection.iceConnectionState === 'failed') {
        console.log('❌ فشل اتصال ICE');
        updateCallStatus('فشل في الاتصال', 'error');
        setTimeout(() => endCall(), 3000);
      }
    };
    
    // إنشاء وإرسال العرض
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: isVideoCall
    });
    await peerConnection.setLocalDescription(offer);
    
    console.log('📤 إرسال العرض:', offer.type);
    console.log('📤 بيانات العرض:', { to: "all", sdp: offer });
    socket.emit("offer", { to: "all", sdp: offer });
    console.log('✅ تم إرسال العرض إلى الخادم');
    
    updateCallStatus('في انتظار انضمام عضو آخر للمكالمة...', 'calling');
    
    // إظهار زر إنهاء المكالمة فور بدء المكالمة
    isCallActive = true;
    showEndCallButton();
    
    // إنهاء المكالمة تلقائياً بعد 30 ثانية إذا لم ينضم أحد
    setTimeout(() => {
      if (isCallActive && peerConnection && peerConnection.connectionState !== 'connected') {
        console.log('⏰ انتهت مهلة انتظار المكالمة');
        updateCallStatus('لم ينضم أحد للمكالمة', 'error');
        setTimeout(() => endCall(), 2000);
      }
    }, 30000);
    
  } catch (error) {
    console.error('خطأ في بدء المكالمة:', error);
    
    // رسائل خطأ واضحة حسب نوع المشكلة
    let errorMessage = 'فشل في بدء المكالمة';
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      errorMessage = 'تم رفض الإذن للوصول للكاميرا والميكروفون';
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      errorMessage = 'لم يتم العثور على كاميرا أو ميكروفون';
    } else if (error.name === 'NotSupportedError') {
      errorMessage = 'المتصفح لا يدعم هذه الميزة';
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      errorMessage = 'الكاميرا أو الميكروفون مستخدم من تطبيق آخر';
    } else if (error.message.includes('غير مدعوم')) {
      errorMessage = error.message;
    }
    
    updateCallStatus(errorMessage, 'error');
    handleCallError(error);
  }
}

// معالجة العروض الواردة
socket.on("offer", async ({ from, sdp }) => {
  try {
    console.log('📞 تم استلام عرض مكالمة من:', from);
    console.log('📞 بيانات العرض المستلم:', { from, sdp });
    
    // تجاهل العروض إذا كانت المكالمة نشطة بالفعل
    if (isCallActive) {
      console.log('⚠️ تجاهل العرض - المكالمة نشطة بالفعل');
      return;
    }
    
    // تنظيف أي اتصال سابق
    if (peerConnection && peerConnection.connectionState !== 'closed') {
      console.log('🔄 إغلاق الاتصال السابق قبل قبول العرض الجديد');
      endCall();
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // السؤال عن قبول المكالمة
    const accept = confirm('📞 مكالمة واردة! هل تريد الإجابة؟');
    if (!accept) {
      return;
    }
    
    updateCallStatus('جاري الإجابة على المكالمة...', 'calling');
    
    // إظهار زر إنهاء المكالمة فور قبول المكالمة
    isCallActive = true;
    showEndCallButton();
    
    // الحصول على إذن الوسائط مع إعدادات محسنة
    const constraints = {
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100
      }
    };
    
    console.log('🎥 طلب إذن الوسائط للرد:', constraints);
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;
    
    // تشغيل الفيديو المحلي
    localVideo.muted = true;
    await localVideo.play();
    
    console.log('📹 تم الحصول على الوسائط للرد:', localStream.getTracks());
    
    // إظهار أدوات التحكم في الكاميرا
    showCameraControls();
    
    // إنشاء اتصال WebRTC
    peerConnection = new RTCPeerConnection(config);
    
    // إضافة المسارات المحلية
    localStream.getTracks().forEach(track => {
      console.log('➕ إضافة مسار للرد:', track.kind, track.enabled);
      peerConnection.addTrack(track, localStream);
    });
    
    // معالجة ICE candidates
    peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log('🧊 إرسال ICE candidate للرد:', candidate.type);
        socket.emit("ice-candidate", { to: from, candidate });
      }
    };
    
    // معالجة المسارات البعيدة
    peerConnection.ontrack = (event) => {
      console.log('📹 تم استلام مسار بعيد للرد:', event.track.kind);
      const [remoteStream] = event.streams;
      
      // تأكد من عدم وجود مصدر سابق
      if (remoteVideo.srcObject !== remoteStream) {
        remoteVideo.srcObject = remoteStream;
        
        // انتظار قصير قبل التشغيل لتجنب التداخل
        setTimeout(() => {
          remoteVideo.play().then(() => {
            console.log('✅ تم تشغيل الفيديو البعيد للرد بنجاح');
            updateCallStatus('المكالمة متصلة', 'connected');
          }).catch(err => {
            console.warn('⚠️ تحذير في تشغيل الفيديو البعيد للرد:', err.message);
            // المحاولة مرة أخرى بعد وقت قصير
            setTimeout(() => {
              remoteVideo.play().catch(() => {
                console.log('ℹ️ الفيديو البعيد للرد سيتم تشغيله تلقائياً');
              });
            }, 500);
          });
        }, 100);
      }
      
      isCallActive = true;
      showEndCallButton();
    };
    
    // معالجة تغيير حالة الاتصال
    peerConnection.onconnectionstatechange = () => {
      console.log('🔗 حالة الاتصال للرد:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        updateCallStatus('المكالمة متصلة', 'connected');
      } else if (peerConnection.connectionState === 'disconnected' || 
                 peerConnection.connectionState === 'failed') {
        console.log('❌ فشل الاتصال للرد، إنهاء المكالمة');
        endCall();
      }
    };
    
    // معالجة حالة ICE
    peerConnection.oniceconnectionstatechange = () => {
      console.log('🧊 حالة ICE للرد:', peerConnection.iceConnectionState);
      
      if (peerConnection.iceConnectionState === 'connected' || 
          peerConnection.iceConnectionState === 'completed') {
        console.log('✅ تم تأسيس اتصال ICE للرد بنجاح');
        updateCallStatus('المكالمة متصلة', 'connected');
        // إلغاء أي مؤقت انتظار سابق
        if (window.iceDisconnectTimeout) {
          clearTimeout(window.iceDisconnectTimeout);
          window.iceDisconnectTimeout = null;
        }
      } else if (peerConnection.iceConnectionState === 'disconnected') {
        console.log('⚠️ انقطع اتصال ICE للرد مؤقتاً');
        updateCallStatus('إعادة الاتصال...', 'warning');
        
        // انتظار 15 ثانية قبل إنهاء المكالمة
        window.iceDisconnectTimeout = setTimeout(() => {
          if (peerConnection && peerConnection.iceConnectionState === 'disconnected') {
            console.log('⏰ انتهت مهلة إعادة الاتصال للرد، إنهاء المكالمة');
            endCall();
          }
        }, 15000);
      } else if (peerConnection.iceConnectionState === 'failed') {
        console.log('❌ فشل اتصال ICE للرد');
        updateCallStatus('فشل في الاتصال', 'error');
        setTimeout(() => endCall(), 3000);
      }
    };
    
    // تعيين الوصف البعيد وإنشاء الإجابة
    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await peerConnection.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await peerConnection.setLocalDescription(answer);
    
    console.log('📤 إرسال الإجابة:', answer.type);
    socket.emit("answer", { to: from, sdp: answer });
    
  } catch (error) {
    console.error('خطأ في الإجابة على المكالمة:', error);
    updateCallStatus('فشل في الإجابة على المكالمة', 'error');
    handleCallError(error);
  }
});

// معالجة الإجابات
socket.on("answer", async ({ sdp }) => {
  try {
    console.log('✅ تم استلام إجابة المكالمة:', sdp.type);
    
    if (!peerConnection) {
      console.error('❌ لا يوجد اتصال نظير');
      return;
    }
    
    // التحقق من حالة الاتصال قبل معالجة الإجابة
    if (peerConnection.signalingState === 'stable') {
      console.log('⚠️ الاتصال في حالة مستقرة، تجاهل الإجابة المكررة');
      return;
    }
    
    if (peerConnection.signalingState !== 'have-local-offer') {
      console.log('⚠️ حالة الإشارة غير متوقعة:', peerConnection.signalingState);
      return;
    }
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('✅ تم تعيين الوصف البعيد للإجابة');
  } catch (error) {
    console.error('❌ خطأ في معالجة الإجابة:', error);
    updateCallStatus('فشل في الاتصال', 'error');
    
    // إعادة تعيين الاتصال في حالة الخطأ
    if (error.name === 'InvalidStateError') {
      console.log('🔄 إعادة تعيين الاتصال بسبب حالة غير صحيحة');
      endCall();
    }
  }
});

// معالجة ICE candidates
socket.on("ice-candidate", async ({ candidate }) => {
  try {
    if (peerConnection && candidate) {
      console.log('🧊 تم استلام ICE candidate:', candidate.type || 'unknown');
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('✅ تم إضافة ICE candidate بنجاح');
    }
  } catch (error) {
    console.error("❌ خطأ في ICE candidate:", error);
  }
});

// إنهاء المكالمة
function endCall() {
  console.log('📞 إنهاء المكالمة');
  
  // تنظيف جميع المؤقتات
  if (window.iceDisconnectTimeout) {
    clearTimeout(window.iceDisconnectTimeout);
    window.iceDisconnectTimeout = null;
  }
  if (window.userDisconnectTimeout) {
    clearTimeout(window.userDisconnectTimeout);
    window.userDisconnectTimeout = null;
  }
  
  // إيقاف المسارات المحلية
  if (localStream) {
    localStream.getTracks().forEach(track => {
      track.stop();
    });
    localStream = null;
  }
  
  // إغلاق اتصال WebRTC
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  // تنظيف عناصر الفيديو
  if (localVideo) localVideo.srcObject = null;
  if (remoteVideo) remoteVideo.srcObject = null;
  
  // تحديث الواجهة
  isCallActive = false;
  updateCallStatus('', '');
  updateCallButtons(true); // هذا سيخفي زر إنهاء المكالمة ويظهر أزرار البدء
  
  // إخفاء أدوات التحكم في الكاميرا
  hideCameraControls();
  
  // إيقاف المؤقت وإخفاء مؤشر الجودة
  stopCallTimer();
  const qualityElement = document.getElementById('connectionQuality');
  if (qualityElement) {
    hideElement(qualityElement);
  }
  
  // تحديث مؤشرات الحالة
  updateMediaStatus();
  
  // إشعار الطرف الآخر
  socket.emit("end-call", { to: "all" });
  
  console.log('✅ تم تنظيف جميع موارد المكالمة');
}

// معالجة إنهاء المكالمة من الطرف الآخر
socket.on("call-ended", () => {
  console.log('📞 تم إنهاء المكالمة من الطرف الآخر');
  endCall();
});

// === وظائف مساعدة ===
function updateCallStatus(message, type) {
  callStatus.textContent = message;
  callStatus.className = `call-status ${type}`;
}

function updateCallButtons(enabled) {
  const screenShareBtn = document.getElementById('screenShareBtn');
  
  startCallBtn.disabled = !enabled;
  startAudioBtn.disabled = !enabled;
  
  if (enabled) {
    startCallBtn.style.opacity = '1';
    startAudioBtn.style.opacity = '1';
    showElement(startCallBtn, 'inline-block');
    showElement(startAudioBtn, 'inline-block');
    hideElement(endCallBtn);
    hideElement(screenShareBtn);
  } else {
    startCallBtn.style.opacity = '0.5';
    startAudioBtn.style.opacity = '0.5';
  }
}

// وظيفة منفصلة لإظهار زر إنهاء المكالمة
function showEndCallButton() {
  const screenShareBtn = document.getElementById('screenShareBtn');
  
  hideElement(startCallBtn);
  hideElement(startAudioBtn);
  showElement(endCallBtn, 'inline-block');
  showElement(screenShareBtn, 'inline-block');
}

function handleCallError(error) {
  console.error('خطأ في المكالمة:', error);
  
  if (error.name === 'NotAllowedError') {
    alert('⚠️ يجب السماح بالوصول للكاميرا والميكروفون لإجراء المكالمات');
  } else if (error.name === 'NotFoundError') {
    alert('⚠️ لم يتم العثور على كاميرا أو ميكروفون');
  } else {
    alert('⚠️ حدث خطأ في المكالمة. تأكد من اتصالك بالإنترنت');
  }
  
  endCall();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function playNotificationSound() {
  // يمكن إضافة صوت تنبيه بسيط هنا
  // const audio = new Audio('notification.mp3');
  // audio.play().catch(() => {});
}

// معالجة قطع الاتصال للمستخدمين
socket.on("user-disconnected", (userId) => {
  console.log('👤 مستخدم خرج:', userId);
  
  // إعطاء وقت للمستخدم للعودة (قد يكون انقطاع مؤقت)
  if (isCallActive) {
    updateCallStatus('انقطع اتصال المستخدم الآخر...', 'warning');
    
    // إلغاء أي مؤقت سابق
    if (window.userDisconnectTimeout) {
      clearTimeout(window.userDisconnectTimeout);
    }
    
    // انتظار 15 ثانية قبل إنهاء المكالمة
    window.userDisconnectTimeout = setTimeout(() => {
      if (isCallActive) {
        console.log('⏰ انتهت مهلة الانتظار، إنهاء المكالمة');
        updateCallStatus('انقطع الاتصال', 'error');
        endCall();
      }
    }, 15000);
  }
});

// معالجة عودة المستخدم
socket.on('user-reconnected', (userId) => {
  console.log('🔄 عاد المستخدم:', userId);
  
  // إلغاء مؤقت إنهاء المكالمة
  if (window.userDisconnectTimeout) {
    clearTimeout(window.userDisconnectTimeout);
    window.userDisconnectTimeout = null;
    
    if (isCallActive) {
      updateCallStatus('عاد المستخدم الآخر', 'connected');
    }
  }
});

// تنظيف الموارد عند إغلاق الصفحة
window.addEventListener('beforeunload', () => {
  if (isCallActive) {
    endCall();
  }
});

// === وظائف التحكم في الكاميرا ===

// متغيرات للتحكم في الكاميرا
let currentCameraFacing = 'user'; // 'user' للأمامية، 'environment' للخلفية
let isMuted = false;
let isVideoEnabled = true;
let currentZoom = 1;
let currentFilter = 'none';
let capturedPhotos = [];

// تبديل الكاميرا (أمامية/خلفية)
async function switchCamera() {
  if (!localStream) {
    console.warn('⚠️ لا توجد كاميرا نشطة للتبديل');
    return;
  }

  try {
    console.log('🔄 تبديل الكاميرا من', currentCameraFacing);
    
    // إيقاف المسارات الحالية
    localStream.getTracks().forEach(track => track.stop());
    
    // تبديل اتجاه الكاميرا
    currentCameraFacing = currentCameraFacing === 'user' ? 'environment' : 'user';
    
    // الحصول على كاميرا جديدة
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: currentCameraFacing,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100
      }
    });
    
    localStream = newStream;
    localVideo.srcObject = localStream;
    
    // تحديث المسارات في الاتصال
    if (peerConnection && isCallActive) {
      const sender = peerConnection.getSenders().find(s => 
        s.track && s.track.kind === 'video'
      );
      if (sender) {
        await sender.replaceTrack(localStream.getVideoTracks()[0]);
        console.log('✅ تم تحديث مسار الفيديو في الاتصال');
      }
    }
    
    // إعادة تطبيق الفلتر والتكبير
    applyFilter(currentFilter);
    adjustZoom(currentZoom);
    
    console.log('✅ تم تبديل الكاميرا إلى:', currentCameraFacing);
    
  } catch (error) {
    console.error('❌ خطأ في تبديل الكاميرا:', error);
    // العودة للكاميرا السابقة
    currentCameraFacing = currentCameraFacing === 'user' ? 'environment' : 'user';
  }
}

// كتم/إلغاء كتم الصوت
function toggleMute() {
  if (!localStream) {
    console.warn('⚠️ لا توجد كاميرا نشطة للتحكم في الصوت');
    return;
  }
  
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    isMuted = !isMuted;
    audioTrack.enabled = !isMuted;
    
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
      muteBtn.innerHTML = isMuted ? '🔇 الصوت مكتوم' : '🎤 الصوت';
      muteBtn.classList.toggle('active', isMuted);
      muteBtn.title = isMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت';
    }
    
    // تحديث مؤشرات الحالة
    updateMediaStatus();
    
    console.log(isMuted ? '🔇 تم كتم الصوت' : '🎤 تم إلغاء كتم الصوت');
  }
}

// تشغيل/إيقاف الفيديو
function toggleVideo() {
  if (!localStream) {
    console.warn('⚠️ لا توجد كاميرا نشطة للتحكم في الفيديو');
    return;
  }
  
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    isVideoEnabled = !isVideoEnabled;
    videoTrack.enabled = isVideoEnabled;
    
    const videoBtn = document.getElementById('videoBtn');
    if (videoBtn) {
      videoBtn.innerHTML = isVideoEnabled ? '📹 الفيديو' : '📷 الفيديو متوقف';
      videoBtn.classList.toggle('active', !isVideoEnabled);
      videoBtn.title = isVideoEnabled ? 'إيقاف الفيديو' : 'تشغيل الفيديو';
    }
    
    // تحديث مؤشرات الحالة
    updateMediaStatus();
    
    console.log(isVideoEnabled ? '📹 تم تشغيل الفيديو' : '📷 تم إيقاف الفيديو');
  }
}

// تعديل التكبير
function adjustZoom(value) {
  currentZoom = parseFloat(value);
  const zoomValue = document.getElementById('zoomValue');
  zoomValue.textContent = currentZoom.toFixed(1) + 'x';
  
  // تطبيق التكبير مع مراعاة حالة الانعكاس
  if (isVideoFlipped) {
    localVideo.style.transform = `scaleX(-1) scale(${currentZoom})`;
  } else {
    localVideo.style.transform = `scale(${currentZoom})`;
  }
  
  console.log('🔍 تم تعديل التكبير إلى:', currentZoom);
}

// تطبيق الفلاتر
function applyFilter(filterType) {
  currentFilter = filterType;
  
  // إزالة جميع فئات الفلاتر السابقة
  localVideo.className = localVideo.className.replace(/video-filter-\w+/g, '');
  
  // إضافة الفلتر الجديد
  if (filterType !== 'none') {
    localVideo.classList.add(`video-filter-${filterType}`);
  }
  
  console.log('🎨 تم تطبيق الفلتر:', filterType);
}

// متغير لحفظ حالة انعكاس الفيديو
let isVideoFlipped = true; // افتراضياً الفيديو معكوس (طبيعي للمستخدم)

// تبديل انعكاس الفيديو المحلي
function toggleVideoFlip() {
  const flipBtn = document.getElementById('flipVideoBtn');
  
  isVideoFlipped = !isVideoFlipped;
  
  if (isVideoFlipped) {
    // الفيديو معكوس (يظهر طبيعي للمستخدم)
    localVideo.style.transform = `scaleX(-1) scale(${currentZoom || 1})`;
    flipBtn.textContent = '🪞 طبيعي';
    flipBtn.title = 'الفيديو يظهر بشكل طبيعي (معكوس)';
    console.log('🪞 تم تفعيل الانعكاس - الفيديو يظهر طبيعي');
  } else {
    // الفيديو غير معكوس (يظهر كما تراه الكاميرا)
    localVideo.style.transform = `scale(${currentZoom || 1})`;
    flipBtn.textContent = '🪞 معكوس';
    flipBtn.title = 'الفيديو يظهر كما تراه الكاميرا (غير معكوس)';
    console.log('🪞 تم إلغاء الانعكاس - الفيديو يظهر كما تراه الكاميرا');
  }
  
  // حفظ الإعداد في localStorage
  localStorage.setItem('videoFlipped', isVideoFlipped);
}

// التقاط صورة
function capturePhoto() {
  if (!localStream) {
    console.warn('⚠️ لا توجد كاميرا نشطة لالتقاط الصورة');
    return;
  }

  try {
    // إنشاء canvas لالتقاط الصورة
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // تعيين أبعاد الصورة
    canvas.width = localVideo.videoWidth || 640;
    canvas.height = localVideo.videoHeight || 480;
    
    // رسم الفيديو على Canvas
    ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
    
    // تحويل إلى صورة
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    const timestamp = new Date().toLocaleString('ar-SA');
    
    // إضافة الصورة للمجموعة
    const photo = {
      id: Date.now(),
      data: imageData,
      timestamp: timestamp,
      filter: currentFilter,
      zoom: currentZoom
    };
    
    capturedPhotos.push(photo);
    displayCapturedPhoto(photo);
    
    // إظهار منطقة الصور
    const capturedPhotosDiv = document.getElementById('capturedPhotos');
    showElement(capturedPhotosDiv);
    
    console.log('📸 تم التقاط صورة بنجاح');
    
    // تأثير فلاش
    localVideo.style.filter = 'brightness(2)';
    setTimeout(() => {
      applyFilter(currentFilter); // إعادة الفلتر الأصلي
    }, 100);
    
  } catch (error) {
    console.error('❌ خطأ في التقاط الصورة:', error);
  }
}

// عرض الصورة المُلتقطة
function displayCapturedPhoto(photo) {
  const photosContainer = document.getElementById('photosContainer');
  
  const photoDiv = document.createElement('div');
  photoDiv.className = 'photo-item';
  photoDiv.innerHTML = `
    <img src="${photo.data}" alt="صورة ملتقطة">
    <div class="photo-info">
      ${photo.timestamp}
    </div>
    <button class="download-btn" onclick="downloadPhoto('${photo.id}')" title="تحميل الصورة">
      ⬇️
    </button>
  `;
  
  photosContainer.appendChild(photoDiv);
}

// تحميل الصورة
function downloadPhoto(photoId) {
  const photo = capturedPhotos.find(p => p.id == photoId);
  if (!photo) return;
  
  const link = document.createElement('a');
  link.download = `family-photo-${photo.timestamp.replace(/[/:]/g, '-')}.jpg`;
  link.href = photo.data;
  link.click();
  
  console.log('⬇️ تم تحميل الصورة');
}

// إظهار/إخفاء أدوات التحكم
function showCameraControls() {
  const settingsBtn = document.getElementById('cameraSettingsBtn');
  if (settingsBtn) {
    showElement(settingsBtn);
    console.log('🎛️ تم إظهار زر إعدادات الكاميرا');
  } else {
    console.warn('⚠️ لم يتم العثور على زر إعدادات الكاميرا');
  }
  
  // تحديث حالة زر الانعكاس
  updateFlipButtonState();
}

// تحديث حالة زر الانعكاس
function updateFlipButtonState() {
  const flipBtn = document.getElementById('flipVideoBtn');
  if (flipBtn) {
    if (isVideoFlipped) {
      flipBtn.textContent = '🪞 طبيعي';
      flipBtn.title = 'الفيديو يظهر بشكل طبيعي (معكوس)';
    } else {
      flipBtn.textContent = '🪞 معكوس';
      flipBtn.title = 'الفيديو يظهر كما تراه الكاميرا (غير معكوس)';
    }
  }
}

function hideCameraControls() {
  const settingsBtn = document.getElementById('cameraSettingsBtn');
  const controlsPanel = document.getElementById('cameraControlsPanel');
  
  if (settingsBtn) {
    hideElement(settingsBtn);
  }
  if (controlsPanel) {
    hideElement(controlsPanel);
  }
  console.log('🎛️ تم إخفاء أدوات التحكم في الكاميرا');
}

// تبديل إظهار/إخفاء لوحة التحكم
function toggleCameraControls() {
  const controlsPanel = document.getElementById('cameraControlsPanel');
  
  if (!controlsPanel) {
    console.warn('⚠️ لم يتم العثور على لوحة التحكم');
    return;
  }
  
  const isVisible = isElementVisible(controlsPanel);
  
  if (isVisible) {
    hideElement(controlsPanel);
    console.log('🎛️ تم إخفاء لوحة التحكم');
  } else {
    showElement(controlsPanel);
    console.log('🎛️ تم إظهار لوحة التحكم');
    
    // التمرير إلى لوحة التحكم لضمان رؤيتها
    setTimeout(() => {
      controlsPanel.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest' 
      });
    }, 100);
  }
}

// === وظائف الأصوات والإشعارات ===
let audioContext = null;
let audioEnabled = false;

// تفعيل الصوت عند أول تفاعل
function enableAudio() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioEnabled = true;
      console.log('🔊 تم تفعيل نظام الصوت');
    } catch (error) {
      console.warn('⚠️ لا يمكن إنشاء AudioContext:', error.message);
      return;
    }
  }
  
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().then(() => {
      console.log('🔊 تم استئناف AudioContext');
    }).catch(error => {
      console.warn('⚠️ لا يمكن استئناف AudioContext:', error.message);
    });
  }
}

function playNotificationSound() {
  if (!audioEnabled || !audioContext) return;
  
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.log('⚠️ خطأ في تشغيل صوت الإشعار:', error);
  }
}

function playJoinSound() {
  if (!audioEnabled || !audioContext) return;
  
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(523, audioContext.currentTime); // C5
    oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1); // E5
    oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.2); // G5
    
    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
  } catch (error) {
    console.log('⚠️ خطأ في تشغيل صوت الانضمام:', error);
  }
}

function playLeaveSound() {
  if (!audioEnabled || !audioContext) return;
  
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(784, audioContext.currentTime); // G5
    oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1); // E5
    oscillator.frequency.setValueAtTime(523, audioContext.currentTime + 0.2); // C5
    
    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
  } catch (error) {
    console.log('⚠️ خطأ في تشغيل صوت المغادرة:', error);
  }
}

// === وظيفة إظهار إشعار النسخ ===
function showCopyNotification(message) {
  // إزالة أي إشعار موجود
  const existingNotification = document.querySelector('.copy-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // إنشاء إشعار جديد
  const notification = document.createElement('div');
  notification.className = 'copy-notification';
  notification.textContent = message;
  
  // إضافة الإشعار للصفحة
  document.body.appendChild(notification);
  
  // إزالة الإشعار بعد 3 ثوانٍ
  setTimeout(() => {
    if (notification && notification.parentNode) {
      notification.remove();
    }
  }, 3000);
}

// === دالة التشخيص ===
function diagnoseConnection() {
  console.log('🔍 تشخيص الاتصال:');
  console.log('- Socket متصل:', socket.connected);
  console.log('- المكالمة نشطة:', isCallActive);
  console.log('- نوع المكالمة:', isVideoCall ? 'فيديو' : 'صوت');
  
  if (localStream) {
    console.log('- المسارات المحلية:');
    localStream.getTracks().forEach(track => {
      console.log(`  - ${track.kind}: ${track.enabled ? 'مفعل' : 'معطل'} (${track.readyState})`);
    });
  } else {
    console.log('- لا توجد مسارات محلية');
  }
  
  if (peerConnection) {
    console.log('- حالة الاتصال:', peerConnection.connectionState);
    console.log('- حالة ICE:', peerConnection.iceConnectionState);
    console.log('- حالة التجميع:', peerConnection.iceGatheringState);
    console.log('- حالة الإشارة:', peerConnection.signalingState);
  } else {
    console.log('- لا يوجد اتصال WebRTC');
  }
  
  if (remoteVideo.srcObject) {
    const remoteStream = remoteVideo.srcObject;
    console.log('- المسارات البعيدة:');
    remoteStream.getTracks().forEach(track => {
      console.log(`  - ${track.kind}: ${track.enabled ? 'مفعل' : 'معطل'} (${track.readyState})`);
    });
  } else {
    console.log('- لا توجد مسارات بعيدة');
  }
}

// إضافة زر التشخيص للوحة التحكم
window.diagnoseConnection = diagnoseConnection;

// === الوظائف الجديدة المحسنة ===

// تبديل الوضع الليلي/النهاري
function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(currentTheme);
  localStorage.setItem('theme', currentTheme);
  
  // إشعار بالتغيير
  showNotification(
    currentTheme === 'dark' ? '🌙 تم تفعيل الوضع الليلي' : '☀️ تم تفعيل الوضع النهاري',
    'info'
  );
}

// تطبيق الوضع
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// إظهار/إخفاء الإيموجي بيكر المحسن
function toggleEmojiPicker() {
  const emojiPicker = document.getElementById('emojiPicker');
  const isVisible = isElementVisible(emojiPicker);
  
  if (isVisible) {
    hideElement(emojiPicker);
  } else {
    showElement(emojiPicker);
    
    // إعداد مستمع الأحداث للإيموجي بيكر المحسن
    const advancedPicker = document.getElementById('advancedEmojiPicker');
    if (advancedPicker && !advancedPicker.hasEmojiListener) {
      advancedPicker.addEventListener('emoji-click', (event) => {
        addEmoji(event.detail.emoji.unicode);
      });
      advancedPicker.hasEmojiListener = true;
    }
  }
}

// إضافة إيموجي للرسالة (محسنة)
function addEmoji(emoji) {
  const msgBox = document.getElementById('msgBox');
  const cursorPos = msgBox.selectionStart;
  const textBefore = msgBox.value.substring(0, cursorPos);
  const textAfter = msgBox.value.substring(cursorPos);
  
  msgBox.value = textBefore + emoji + textAfter;
  msgBox.focus();
  msgBox.setSelectionRange(cursorPos + emoji.length, cursorPos + emoji.length);
  
  // إخفاء الإيموجي بيكر
  hideElement(document.getElementById('emojiPicker'));
  
  // تحديث حجم النص
  autoResizeTextarea(msgBox);
}

// تغيير حجم صندوق النص تلقائياً
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// معالجة الكتابة
function handleTyping() {
  if (!isTyping) {
    isTyping = true;
    socket.emit('typing-start');
  }
  
  // إلغاء المؤقت السابق
  clearTimeout(typingTimeout);
  
  // إيقاف الكتابة بعد 3 ثوان
  typingTimeout = setTimeout(() => {
    isTyping = false;
    socket.emit('typing-stop');
  }, 3000);
}

// معالجة رفع الملفات
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // التحقق من حجم الملف (5MB كحد أقصى)
  if (file.size > 5 * 1024 * 1024) {
    showNotification('❌ حجم الملف كبير جداً (الحد الأقصى 5MB)', 'error');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const fileData = {
      name: file.name,
      type: file.type,
      size: file.size,
      data: e.target.result
    };
    
    // إرسال الملف
    socket.emit('file-upload', fileData);
    showNotification('📎 تم رفع الملف بنجاح', 'success');
  };
  
  reader.readAsDataURL(file);
  
  // إعادة تعيين قيمة الإدخال
  event.target.value = '';
}

// بدء مؤقت المكالمة
function startCallTimer() {
  callStartTime = Date.now();
  const callTimer = document.getElementById('callTimer');
  const callTime = document.getElementById('callTime');
  
  callTimer.classList.add('show');
  
  callTimerInterval = setInterval(() => {
    const elapsed = Date.now() - callStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    callTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

// إيقاف مؤقت المكالمة
function stopCallTimer() {
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }
  
  const callTimer = document.getElementById('callTimer');
  callTimer.classList.remove('show');
  
  callStartTime = null;
}

// تحديث مؤشر جودة الاتصال
function updateConnectionQuality(quality) {
  const qualityElement = document.getElementById('connectionQuality');
  const qualityText = document.getElementById('qualityText');
  
  if (!qualityElement || !qualityText) return;
  
  // إزالة الفئات السابقة
  qualityElement.className = 'connection-quality';
  
  let text = '';
  switch (quality) {
    case 'excellent':
      qualityElement.classList.add('excellent');
      text = 'ممتاز';
      break;
    case 'good':
      qualityElement.classList.add('good');
      text = 'جيد';
      break;
    case 'poor':
      qualityElement.classList.add('poor');
      text = 'ضعيف';
      break;
    case 'very-poor':
      qualityElement.classList.add('very-poor');
      text = 'ضعيف جداً';
      break;
    default:
      text = 'غير معروف';
  }
  
  qualityText.textContent = text;
  showElement(qualityElement, 'flex');
}

// إظهار الإشعارات
function showNotification(message, type = 'info', duration = 3000) {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // إزالة الإشعار بعد المدة المحددة
  setTimeout(() => {
    notification.classList.add('hide');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, duration);
}

// === وظائف الدعوة ===

// إظهار شاشة الترحيب للمدعوين
function showWelcomeScreen(inviteCode) {
  const welcomeMessage = document.getElementById('welcomeMessage');
  const guestPasswordInput = document.getElementById('guestPasswordInput');
  
  // رسالة ترحيب أساسية
  welcomeMessage.innerHTML = `
    <p>🏠 مرحباً بك في تطبيق العائلة!</p>
    <p>💬 استمتع بالدردشة ومكالمات الفيديو!</p>
  `;
  
  showElement(welcomeScreen, 'flex');
  hideElement(mainApp);
  
  // التحقق من صحة رابط الدعوة
  socket.emit('validate-invite', inviteCode);
}

// إظهار التطبيق الرئيسي
function showMainApp() {
  hideElement(welcomeScreen);
  showElement(mainApp);
}

// الانضمام للعائلة
function joinFamily() {
  const guestPasswordInput = document.getElementById('guestPasswordInput');
  const joinBtn = document.getElementById('joinBtn');
  
  guestName = guestNameInput.value.trim() || 'ضيف';
  const enteredPassword = guestPasswordInput ? guestPasswordInput.value.trim() : '';
  
  // تعطيل الزر أثناء المعالجة
  if (joinBtn) {
    joinBtn.disabled = true;
    joinBtn.textContent = '⏳ جاري الانضمام...';
  }
  
  // التحقق من كلمة المرور إذا كانت مطلوبة
  const urlParams = new URLSearchParams(window.location.search);
  const requiresPassword = urlParams.get('protected') === 'true';
  
  if (requiresPassword && !enteredPassword) {
    alert('🔒 هذه الغرفة محمية بكلمة مرور. يرجى إدخال كلمة المرور للانضمام.');
    if (joinBtn) {
      joinBtn.disabled = false;
      joinBtn.textContent = '🚀 انضمام للعائلة';
    }
    return;
  }
  
  // تشفير كلمة المرور قبل الإرسال (تشفير بسيط)
  const encryptedPassword = enteredPassword ? btoa(enteredPassword) : '';
  
  // إرسال طلب الانضمام مع كلمة المرور المشفرة
  socket.emit('join-room', {
    guestName: guestName,
    password: encryptedPassword,
    inviteId: urlParams.get('invite')
  });
  
  // إظهار التطبيق الرئيسي (سيتم إخفاؤه إذا فشلت كلمة المرور)
  showMainApp();
  
  // إرسال رسالة ترحيب
  setTimeout(() => {
    const welcomeMsg = `🎉 ${guestName} انضم إلى المحادثة!`;
    socket.emit("chat-message", welcomeMsg);
  }, 1000);
}

// إنشاء رابط دعوة
function createInviteLink() {
  if (!familyNameInput) {
    console.error('عنصر اسم العائلة غير موجود');
    return;
  }
  
  const roomPasswordInput = document.getElementById('roomPasswordInput');
  const createInviteBtn = document.getElementById('createInviteBtn');
  
  if (createInviteBtn) {
    createInviteBtn.disabled = true;
    createInviteBtn.textContent = '⏳ جاري الإنشاء...';
  }
  
  familyName = familyNameInput.value.trim() || 'العائلة';
  const roomPassword = roomPasswordInput ? roomPasswordInput.value.trim() : '';
  const baseUrl = window.location.origin + window.location.pathname.replace(/\/$/, '');
  
  // تشفير كلمة المرور قبل الإرسال
  const encryptedRoomPassword = roomPassword ? btoa(roomPassword) : '';
  
  console.log('إرسال طلب إنشاء دعوة:', { familyName, hasPassword: !!roomPassword, baseUrl });
  
  socket.emit('create-invite', {
    familyName: familyName,
    roomPassword: encryptedRoomPassword,
    baseUrl: baseUrl
  });
}

// نسخ رابط الدعوة للجوال
function copyMobileInviteLink() {
  if (!mobileInviteLinkText) return;
  
  mobileInviteLinkText.select();
  mobileInviteLinkText.setSelectionRange(0, 99999);
  
  try {
    document.execCommand('copy');
    const copyBtn = document.getElementById('copyMobileBtn');
    if (copyBtn) {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = '✅ تم النسخ!';
      copyBtn.style.background = '#4CAF50';
      
      // إظهار إشعار النسخ
      showCopyNotification('📱 تم نسخ رابط الجوال بنجاح!');
      
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = '#4CAF50';
      }, 2000);
    }
  } catch (err) {
    alert('فشل في نسخ الرابط. يرجى نسخه يدوياً');
  }
}

// نسخ رابط الدعوة للكمبيوتر
function copyLocalInviteLink() {
  if (!localInviteLinkText) return;
  
  localInviteLinkText.select();
  localInviteLinkText.setSelectionRange(0, 99999);
  
  try {
    document.execCommand('copy');
    const copyBtn = document.getElementById('copyLocalBtn');
    if (copyBtn) {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = '✅ تم النسخ!';
      copyBtn.style.background = '#4CAF50';
      
      // إظهار إشعار النسخ
      showCopyNotification('💻 تم نسخ رابط الكمبيوتر بنجاح!');
      
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = '#4CAF50';
      }, 2000);
    }
  } catch (err) {
    alert('فشل في نسخ الرابط. يرجى نسخه يدوياً');
  }
}

// مشاركة عبر WhatsApp
function shareViaWhatsApp() {
  const message = `🎉 مرحباً! تم دعوتك للانضمام إلى دردشة ${familyName}!\n\n📱 للهاتف الجوال:\n${currentMobileInviteLink}\n\n💻 للكمبيوتر:\n${currentLocalInviteLink}\n\n💝 نتطلع لرؤيتك معنا!`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
}

// مشاركة عبر الإيميل
function shareViaEmail() {
  const subject = `دعوة للانضمام إلى دردشة ${familyName}`;
  const body = `مرحباً!\n\nتم دعوتك للانضمام إلى دردشة العائلة "${familyName}".\n\nللانضمام:\n\n📱 من الهاتف الجوال:\n${currentMobileInviteLink}\n\n💻 من الكمبيوتر:\n${currentLocalInviteLink}\n\nالرابط صالح لمدة 24 ساعة.\n\nنتطلع لرؤيتك معنا!\n\nمع أطيب التحيات`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoUrl;
}

// === مستمعي أحداث الدعوة ===

// عند إنشاء رابط دعوة بنجاح
socket.on('invite-created', (data) => {
  console.log('تم استلام بيانات الدعوة:', data);
  
  currentMobileInviteLink = data.mobileUrl || data.url;
  currentLocalInviteLink = data.localUrl || data.url;
  
  if (mobileInviteLinkText) {
    mobileInviteLinkText.value = currentMobileInviteLink;
  }
  if (localInviteLinkText) {
    localInviteLinkText.value = currentLocalInviteLink;
  }
  if (inviteResult) {
    showElement(inviteResult);
    
    // تحديث النص ليشمل اسم العائلة
    const inviteInfo = inviteResult.querySelector('.invite-info p');
    if (inviteInfo) {
      inviteInfo.innerHTML = `<strong>رابط دعوة "${data.familyName}" جاهز! 🎉</strong>`;
    }
  }
  
  // إنشاء QR Code
  generateQRCode(currentMobileInviteLink);
  
  // إعادة تفعيل زر الإنشاء
  const createInviteBtn = document.getElementById('createInviteBtn');
  if (createInviteBtn) {
    createInviteBtn.disabled = false;
    createInviteBtn.textContent = 'إنشاء رابط دعوة';
  }
});

// عند التحقق من صحة الدعوة
socket.on('invite-valid', (data) => {
  familyName = data.familyName;
  welcomeMessage.innerHTML = `
    <h3>🏠 مرحباً بك في دردشة "${data.familyName}"</h3>
    <p>تم إنشاء هذه الدعوة في: ${new Date(data.createdAt).toLocaleString('ar-SA')}</p>
    <p>اكتب اسمك أدناه للانضمام إلى المحادثة</p>
  `;
});

// عند فشل التحقق من الدعوة
socket.on('invite-invalid', (data) => {
  welcomeMessage.innerHTML = `
    <div style="background: #ffebee; border: 2px solid #f44336; padding: 20px; border-radius: 15px;">
      <h3 style="color: #c62828;">❌ رابط الدعوة غير صالح</h3>
      <p style="color: #666;">${data.message}</p>
      <button onclick="goToMainApp()" style="margin-top: 15px; padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 10px; cursor: pointer;">
        🏠 الذهاب للصفحة الرئيسية
      </button>
    </div>
  `;
});

// الذهاب للتطبيق الرئيسي
function goToMainApp() {
  window.location.href = window.location.origin + window.location.pathname;
}

// إنشاء QR Code للدعوة
function generateQRCode(url) {
  const qrCodeContainer = document.getElementById('qrCodeContainer');
  const qrCodeCanvas = document.getElementById('qrCodeCanvas');
  
  if (!qrCodeContainer || !qrCodeCanvas) {
    console.warn('QR Code elements not found');
    return;
  }
  
  // انتظار تحميل مكتبة QR Code
  if (!window.QRCode) {
    console.log('انتظار تحميل مكتبة QR Code...');
    setTimeout(() => generateQRCode(url), 500);
    return;
  }
  
  try {
    // مسح المحتوى السابق
    const context = qrCodeCanvas.getContext('2d');
    context.clearRect(0, 0, qrCodeCanvas.width, qrCodeCanvas.height);
    
    // إنشاء QR Code جديد
    window.QRCode.toCanvas(qrCodeCanvas, url, {
      width: 200,
      height: 200,
      margin: 2,
      color: {
        dark: '#667eea',
        light: '#ffffff'
      }
    }, function (error) {
      if (error) {
        console.error('خطأ في إنشاء QR Code:', error);
      } else {
        console.log('تم إنشاء QR Code بنجاح');
        showElement(qrCodeContainer);
      }
    });
    
  } catch (error) {
    console.error('خطأ في إنشاء QR Code:', error);
  }
}

// === وظائف رسائل النظام ===

// عرض رسالة نظام
function displaySystemMessage(message, type = 'info') {
  const messageDiv = document.createElement("div");
  messageDiv.className = `system-message ${type} fade-in`;
  messageDiv.textContent = message;
  
  messages.appendChild(messageDiv);
  messages.scrollTop = messages.scrollHeight;
}

// تعديل رسالة
function editMessage(messageId, buttonElement) {
  const messageDiv = buttonElement.closest('.message');
  const textDiv = messageDiv.querySelector('.text');
  const originalText = textDiv.getAttribute('data-original-text');
  
  // إنشاء حقل التعديل
  const editInput = document.createElement('textarea');
  editInput.value = originalText;
  editInput.className = 'edit-message-input';
  editInput.maxLength = 500;
  editInput.rows = 2;
  
  // إنشاء أزرار الحفظ والإلغاء
  const editControls = document.createElement('div');
  editControls.className = 'edit-message-controls';
  editControls.innerHTML = `
    <button onclick="saveMessageEdit('${messageId}', this)" class="save-edit-btn">💾 حفظ</button>
    <button onclick="cancelMessageEdit('${messageId}', this)" class="cancel-edit-btn">❌ إلغاء</button>
  `;
  
  // استبدال النص بحقل التعديل
  hideElement(textDiv);
  textDiv.parentNode.insertBefore(editInput, textDiv.nextSibling);
  textDiv.parentNode.insertBefore(editControls, editInput.nextSibling);
  
  // إخفاء أزرار التحكم الأصلية
  const messageControls = messageDiv.querySelector('.message-controls');
  if (messageControls) {
    hideElement(messageControls);
  }
  
  editInput.focus();
}

// حفظ تعديل الرسالة
function saveMessageEdit(messageId, buttonElement) {
  const messageDiv = buttonElement.closest('.message');
  const editInput = messageDiv.querySelector('.edit-message-input');
  const newText = editInput.value.trim();
  
  if (!newText) {
    showNotification('لا يمكن أن تكون الرسالة فارغة', 'error');
    return;
  }
  
  if (newText.length > 500) {
    showNotification('الرسالة طويلة جداً (الحد الأقصى 500 حرف)', 'error');
    return;
  }
  
  // إرسال طلب التعديل للخادم
  socket.emit('edit-message', {
    messageId: messageId,
    newText: newText,
    room: currentRoom
  });
  
  // تحديث النص محلياً
  const textDiv = messageDiv.querySelector('.text');
  textDiv.textContent = newText + ' (تم التعديل)';
  textDiv.setAttribute('data-original-text', newText);
  textDiv.classList.add('edited-message');
  
  // إزالة عناصر التعديل
  cancelMessageEdit(messageId, buttonElement);
  
  showNotification('تم تعديل الرسالة بنجاح', 'success');
}

// إلغاء تعديل الرسالة
function cancelMessageEdit(messageId, buttonElement) {
  const messageDiv = buttonElement.closest('.message');
  const textDiv = messageDiv.querySelector('.text');
  const editInput = messageDiv.querySelector('.edit-message-input');
  const editControls = messageDiv.querySelector('.edit-message-controls');
  const messageControls = messageDiv.querySelector('.message-controls');
  
  // إزالة عناصر التعديل
  if (editInput) editInput.remove();
  if (editControls) editControls.remove();
  
  // إظهار النص الأصلي وأزرار التحكم
  showElement(textDiv);
  if (messageControls) {
    showElement(messageControls, 'flex');
  }
}

// حذف رسالة
function deleteMessage(messageId, buttonElement) {
  if (!confirm('هل أنت متأكد من حذف هذه الرسالة؟')) {
    return;
  }
  
  const messageDiv = buttonElement.closest('.message');
  
  // إرسال طلب الحذف للخادم
  socket.emit('delete-message', {
    messageId: messageId,
    room: currentRoom
  });
  
  // حذف الرسالة محلياً
  messageDiv.classList.add('deleted-message');
  setTimeout(() => {
    messageDiv.remove();
  }, 300);
  
  showNotification('تم حذف الرسالة', 'info');
}

// === معالجات الأحداث الجديدة ===

// معالجة انضمام مستخدم جديد
socket.on('user-joined', (data) => {
  displaySystemMessage(`🎉 ${data.name || 'مستخدم جديد'} انضم إلى المحادثة`, 'join');
  updateUserCount(data.userCount);
});

// معالجة مغادرة مستخدم
socket.on('user-left', (data) => {
  displaySystemMessage(`👋 ${data.name || 'مستخدم'} غادر المحادثة`, 'leave');
  updateUserCount(data.userCount);
});

// معالجة تعديل الرسائل من المستخدمين الآخرين
socket.on('message-edited', (data) => {
  const messageDiv = document.querySelector(`[data-message-id="${data.messageId}"]`);
  if (messageDiv) {
    const textDiv = messageDiv.querySelector('.text');
    if (textDiv) {
      textDiv.textContent = data.newText + ' (تم التعديل)';
      textDiv.setAttribute('data-original-text', data.newText);
      textDiv.classList.add('edited-message');
    }
  }
});

// معالجة حذف الرسائل من المستخدمين الآخرين
socket.on('message-deleted', (data) => {
  const messageDiv = document.querySelector(`[data-message-id="${data.messageId}"]`);
  if (messageDiv) {
    messageDiv.classList.add('deleted-message');
    setTimeout(() => {
      messageDiv.remove();
    }, 300);
  }
});

// معالجة بدء الكتابة
socket.on('typing-start', (userId) => {
  if (userId !== socket.id) {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
      typingIndicator.classList.add('show');
    }
  }
});

// معالجة إيقاف الكتابة
socket.on('typing-stop', (userId) => {
  if (userId !== socket.id) {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
      typingIndicator.classList.remove('show');
    }
  }
});

// معالجة استلام الملفات
socket.on('file-received', (fileData) => {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message file-message fade-in';
  
  const isOwnMessage = fileData.senderId === socket.id;
  messageDiv.classList.add(isOwnMessage ? 'own' : 'other');
  
  const senderName = isOwnMessage ? 'أنت' : `مستخدم ${fileData.senderId.substring(0, 6)}`;
  
  let fileContent = '';
  if (fileData.type.startsWith('image/')) {
    fileContent = `<img src="${fileData.data}" alt="${fileData.name}" style="max-width: 200px; border-radius: 8px; cursor: pointer;" onclick="openImageModal(this.src)">`;
  } else if (fileData.type.startsWith('video/')) {
    fileContent = `<video controls style="max-width: 200px; border-radius: 8px;"><source src="${fileData.data}" type="${fileData.type}"></video>`;
  } else if (fileData.type.startsWith('audio/')) {
    fileContent = `<audio controls><source src="${fileData.data}" type="${fileData.type}"></audio>`;
  } else {
    fileContent = `<div class="file-info">📎 ${fileData.name} (${(fileData.size / 1024).toFixed(1)} KB)</div>`;
  }
  
  messageDiv.innerHTML = `
    <div class="sender">${senderName}</div>
    <div class="file-content">${fileContent}</div>
    <div class="time">${fileData.timestamp}</div>
  `;
  
  messages.appendChild(messageDiv);
  messages.scrollTop = messages.scrollHeight;
  
  if (!isOwnMessage) {
    playNotificationSound();
    showNotification(`📎 ${senderName} أرسل ملف: ${fileData.name}`, 'info');
  }
});

// فتح الصورة في نافذة منبثقة
function openImageModal(src) {
  const modal = document.createElement('div');
  modal.className = 'image-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    cursor: pointer;
  `;
  
  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = `
    max-width: 90%;
    max-height: 90%;
    border-radius: 10px;
    box-shadow: 0 0 30px rgba(255, 255, 255, 0.3);
  `;
  
  modal.appendChild(img);
  document.body.appendChild(modal);
  
  modal.onclick = () => {
    document.body.removeChild(modal);
  };
}

// تم حذف التعديل المكرر على startCall - الوظائف مدمجة في الوظيفة الأصلية

// تم حذف التعديل المكرر على endCall - الوظائف مدمجة في الوظيفة الأصلية

// === الوظائف الجديدة ===

// تبديل الوضع الليلي/النهاري
function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(currentTheme);
  localStorage.setItem('theme', currentTheme);
}

// تطبيق الوضع
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// معالجة الكتابة
function handleTyping() {
  if (!isTyping) {
    isTyping = true;
    socket.emit('typing-start');
  }
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
    socket.emit('typing-stop');
  }, 1000);
}

// تغيير حجم صندوق النص تلقائياً
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// تبديل إيموجي بيكر
function toggleEmojiPicker() {
  const emojiPicker = document.getElementById('emojiPicker');
  emojiPicker.classList.toggle('show');
}

// إضافة إيموجي
function addEmoji(emoji) {
  const msgBox = document.getElementById('msgBox');
  msgBox.value += emoji;
  msgBox.focus();
  
  // إخفاء الإيموجي بيكر
  document.getElementById('emojiPicker').classList.remove('show');
}

// معالجة رفع الملفات
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // التحقق من حجم الملف (5MB كحد أقصى)
  if (file.size > 5 * 1024 * 1024) {
    showNotification('الملف كبير جداً! الحد الأقصى 5 ميجابايت', 'error');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const fileData = {
      name: file.name,
      type: file.type,
      size: file.size,
      data: e.target.result
    };
    
    socket.emit('file-upload', fileData);
    showNotification(`تم رفع الملف: ${file.name}`, 'success');
  };
  
  reader.readAsDataURL(file);
  event.target.value = ''; // إعادة تعيين الإدخال
}

// عرض الإشعارات
function showNotification(message, type = 'info', duration = 3000) {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // إظهار الإشعار
  setTimeout(() => {
    notification.classList.remove('hide');
  }, 100);
  
  // إخفاء الإشعار
  setTimeout(() => {
    notification.classList.add('hide');
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, duration);
}

// بدء مؤقت المكالمة
function startCallTimer() {
  callStartTime = Date.now();
  const timerElement = document.getElementById('callTimer');
  const timeElement = document.getElementById('callTime');
  
  if (timerElement) {
    timerElement.classList.add('show');
  }
  
  callTimerInterval = setInterval(() => {
    const elapsed = Date.now() - callStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    if (timeElement) {
      timeElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }, 1000);
}

// إيقاف مؤقت المكالمة
function stopCallTimer() {
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }
  
  const timerElement = document.getElementById('callTimer');
  if (timerElement) {
    timerElement.classList.remove('show');
  }
  
  callStartTime = null;
}

// تحديث مؤشر جودة الاتصال
function updateConnectionQuality(quality) {
  const qualityElement = document.getElementById('connectionQuality');
  const qualityText = document.getElementById('qualityText');
  
  if (!qualityElement || !qualityText) return;
  
  // إزالة الفئات السابقة
  qualityElement.classList.remove('excellent', 'good', 'poor', 'very-poor');
  
  // إضافة الفئة الجديدة
  qualityElement.classList.add(quality);
  showElement(qualityElement, 'flex');
  
  // تحديث النص
  const qualityTexts = {
    'excellent': 'ممتاز',
    'good': 'جيد', 
    'poor': 'ضعيف',
    'very-poor': 'ضعيف جداً'
  };
  
  qualityText.textContent = qualityTexts[quality] || 'غير معروف';
}

// === معالجات الأحداث الجديدة من الخادم ===

// معالجة بدء الكتابة
socket.on('typing-start', (userId) => {
  const typingIndicator = document.getElementById('typingIndicator');
  if (typingIndicator) {
    typingIndicator.classList.add('show');
  }
});

// معالجة إيقاف الكتابة
socket.on('typing-stop', (userId) => {
  const typingIndicator = document.getElementById('typingIndicator');
  if (typingIndicator) {
    typingIndicator.classList.remove('show');
  }
});

// معالجة استقبال الملفات
socket.on('file-received', (fileData) => {
  displayFileMessage(fileData);
});

// عرض رسالة الملف
function displayFileMessage(fileData) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${fileData.senderId === socket.id ? 'own' : 'other'} file-message`;
  
  const isImage = fileData.type.startsWith('image/');
  const isVideo = fileData.type.startsWith('video/');
  const isAudio = fileData.type.startsWith('audio/');
  
  let fileContent = '';
  
  if (isImage) {
    fileContent = `<img src="${fileData.data}" alt="${fileData.name}" style="max-width: 200px; max-height: 200px; border-radius: 8px;">`;
  } else if (isVideo) {
    fileContent = `<video controls style="max-width: 200px; max-height: 200px; border-radius: 8px;">
                     <source src="${fileData.data}" type="${fileData.type}">
                   </video>`;
  } else if (isAudio) {
    fileContent = `<audio controls style="width: 200px;">
                     <source src="${fileData.data}" type="${fileData.type}">
                   </audio>`;
  } else {
    fileContent = `<div class="file-info">
                     📎 ${fileData.name}<br>
                     <small>الحجم: ${(fileData.size / 1024).toFixed(1)} KB</small><br>
                     <a href="${fileData.data}" download="${fileData.name}" style="color: var(--primary-color);">تحميل الملف</a>
                   </div>`;
  }
  
  messageDiv.innerHTML = `
    <div class="sender">${fileData.senderId === socket.id ? 'أنت' : 'عضو العائلة'}</div>
    <div class="file-content">${fileContent}</div>
    <div class="time">${fileData.timestamp}</div>
  `;
  
  messages.appendChild(messageDiv);
  messages.scrollTop = messages.scrollHeight;
  
  // تشغيل صوت الإشعار
  playNotificationSound();
}

// تشغيل صوت الإشعار
function playNotificationSound() {
  try {
    // إنشاء صوت بسيط باستخدام Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (error) {
    console.log('لا يمكن تشغيل صوت الإشعار:', error);
  }
}

// === وظائف غرف الدردشة المتعددة ===

// عرض نافذة إنشاء غرفة جديدة
function showCreateRoomModal() {
  const modal = document.getElementById('createRoomModal');
  if (modal) {
    showElement(modal, 'flex');
    document.getElementById('roomNameInput').focus();
  }
}

// إخفاء نافذة إنشاء غرفة
function hideCreateRoomModal() {
  const modal = document.getElementById('createRoomModal');
  if (modal) {
    hideElement(modal);
    // إعادة تعيين النموذج
    document.getElementById('roomNameInput').value = '';
    document.getElementById('roomDescInput').value = '';
    document.getElementById('roomPrivateCheck').checked = false;
    document.getElementById('roomIconSelect').selectedIndex = 0;
  }
}

// إنشاء غرفة جديدة
function createNewRoom() {
  const roomName = document.getElementById('roomNameInput').value.trim();
  const roomIcon = document.getElementById('roomIconSelect').value;
  const roomDesc = document.getElementById('roomDescInput').value.trim();
  const isPrivate = document.getElementById('roomPrivateCheck').checked;
  
  if (!roomName) {
    showNotification('يرجى إدخال اسم الغرفة', 'error');
    return;
  }
  
  if (roomName.length > 20) {
    showNotification('اسم الغرفة طويل جداً (الحد الأقصى 20 حرف)', 'error');
    return;
  }
  
  const roomData = {
    name: roomName,
    icon: roomIcon,
    description: roomDesc,
    isPrivate: isPrivate
  };
  
  socket.emit('create-room', roomData);
  hideCreateRoomModal();
}

// تبديل الغرفة
function switchRoom(roomId) {
  if (roomId === currentRoom) return;
  
  // إرسال طلب تغيير الغرفة للخادم
  socket.emit('switch-room', { from: currentRoom, to: roomId });
  
  // تحديث الواجهة محلياً
  currentRoom = roomId;
  updateRoomUI();
  
  // مسح الرسائل الحالية
  const messagesContainer = document.getElementById('messages');
  if (messagesContainer) {
    messagesContainer.innerHTML = '';
  }
  
  showNotification(`تم الانتقال إلى ${availableRooms[roomId]?.name || 'غرفة غير معروفة'}`, 'success');
}

// تحديث واجهة الغرف
function updateRoomUI() {
  // تحديث التبويبات
  const roomTabs = document.querySelectorAll('.room-tab');
  roomTabs.forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.room === currentRoom) {
      tab.classList.add('active');
    }
  });
  
  // تحديث معلومات الغرفة الحالية
  const currentRoomName = document.getElementById('currentRoomName');
  const currentRoomMembers = document.getElementById('currentRoomMembers');
  
  if (currentRoomName && availableRooms[currentRoom]) {
    currentRoomName.textContent = availableRooms[currentRoom].name;
  }
  
  if (currentRoomMembers && availableRooms[currentRoom]) {
    currentRoomMembers.textContent = `${availableRooms[currentRoom].members} أعضاء`;
  }
}

// إضافة غرفة جديدة للواجهة
function addRoomToUI(roomData) {
  const roomsTabsContainer = document.getElementById('roomsTabs');
  if (!roomsTabsContainer) return;
  
  const roomTab = document.createElement('div');
  roomTab.className = 'room-tab';
  roomTab.dataset.room = roomData.id;
  roomTab.onclick = () => switchRoom(roomData.id);
  
  roomTab.innerHTML = `
    <span class="room-icon">${roomData.icon}</span>
    <span class="room-name">${roomData.name}</span>
    <span class="room-count" id="${roomData.id}-count">0</span>
  `;
  
  roomsTabsContainer.appendChild(roomTab);
  
  // إضافة الغرفة للقائمة المحلية
  availableRooms[roomData.id] = {
    name: roomData.name,
    icon: roomData.icon,
    description: roomData.description,
    members: 0,
    isPrivate: roomData.isPrivate
  };
}

// === وظائف مشاركة الملفات المحسنة ===

// عرض نافذة مشاركة الملفات
function showFileShareModal() {
  const modal = document.getElementById('fileShareModal');
  if (modal) {
    showElement(modal, 'flex');
    setupFileUploadArea();
  }
}

// إخفاء نافذة مشاركة الملفات
function hideFileShareModal() {
  const modal = document.getElementById('fileShareModal');
  if (modal) {
    hideElement(modal);
    selectedFiles = [];
    updateSelectedFilesUI();
  }
}

// إعداد منطقة رفع الملفات
function setupFileUploadArea() {
  const uploadArea = document.getElementById('fileUploadArea');
  const fileInput = document.getElementById('fileShareInput');
  
  if (!uploadArea || !fileInput) return;
  
  // معالجة النقر
  uploadArea.onclick = () => fileInput.click();
  
  // معالجة السحب والإفلات
  uploadArea.ondragover = (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  };
  
  uploadArea.ondragleave = () => {
    uploadArea.classList.remove('dragover');
  };
  
  uploadArea.ondrop = (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = Array.from(e.dataTransfer.files);
    handleMultipleFiles(files);
  };
  
  // معالجة اختيار الملفات
  fileInput.onchange = (e) => {
    const files = Array.from(e.target.files);
    handleMultipleFiles(files);
  };
}

// معالجة ملفات متعددة
function handleMultipleFiles(files) {
  files.forEach(file => {
    if (file.size > maxFileSize) {
      showNotification(`الملف "${file.name}" كبير جداً (الحد الأقصى 10 ميجابايت)`, 'error');
      return;
    }
    
    if (selectedFiles.length >= 10) {
      showNotification('لا يمكن رفع أكثر من 10 ملفات في المرة الواحدة', 'error');
      return;
    }
    
    selectedFiles.push(file);
  });
  
  updateSelectedFilesUI();
}

// تحديث واجهة الملفات المختارة
function updateSelectedFilesUI() {
  const container = document.getElementById('selectedFiles');
  const uploadBtn = document.querySelector('.upload-btn');
  
  if (!container) return;
  
  container.innerHTML = '';
  
  selectedFiles.forEach((file, index) => {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    
    const fileIcon = getFileIcon(file.type);
    const fileSize = formatFileSize(file.size);
    
    fileItem.innerHTML = `
      <div class="file-info-left">
        <span class="file-icon">${fileIcon}</span>
        <div class="file-details">
          <div class="file-name">${file.name}</div>
          <div class="file-size">${fileSize}</div>
        </div>
      </div>
      <button class="remove-file" onclick="removeSelectedFile(${index})">حذف</button>
    `;
    
    container.appendChild(fileItem);
  });
  
  // تفعيل/تعطيل زر الرفع
  if (uploadBtn) {
    uploadBtn.disabled = selectedFiles.length === 0;
  }
}

// إزالة ملف من القائمة
function removeSelectedFile(index) {
  selectedFiles.splice(index, 1);
  updateSelectedFilesUI();
}

// رفع الملفات المختارة
function uploadSelectedFiles() {
  if (selectedFiles.length === 0) return;
  
  const uploadBtn = document.querySelector('.upload-btn');
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'جاري الرفع...';
  }
  
  let uploadedCount = 0;
  const totalFiles = selectedFiles.length;
  
  selectedFiles.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const fileData = {
        name: file.name,
        type: file.type,
        size: file.size,
        data: e.target.result,
        room: currentRoom
      };
      
      socket.emit('file-upload', fileData);
      uploadedCount++;
      
      if (uploadedCount === totalFiles) {
        showNotification(`تم رفع ${totalFiles} ملف بنجاح`, 'success');
        hideFileShareModal();
        
        if (uploadBtn) {
          uploadBtn.disabled = false;
          uploadBtn.textContent = 'رفع الملفات';
        }
      }
    };
    
    reader.readAsDataURL(file);
  });
}

// رفع صورة سريعة
function handleQuickImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    showNotification('يرجى اختيار صورة فقط', 'error');
    return;
  }
  
  if (file.size > maxFileSize) {
    showNotification('الصورة كبيرة جداً (الحد الأقصى 10 ميجابايت)', 'error');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const fileData = {
      name: file.name,
      type: file.type,
      size: file.size,
      data: e.target.result,
      room: currentRoom
    };
    
    socket.emit('file-upload', fileData);
    showNotification(`تم رفع الصورة: ${file.name}`, 'success');
  };
  
  reader.readAsDataURL(file);
  event.target.value = '';
}

// الحصول على أيقونة الملف
function getFileIcon(fileType) {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType.startsWith('video/')) return '🎥';
  if (fileType.startsWith('audio/')) return '🎵';
  if (fileType.includes('pdf')) return '📄';
  if (fileType.includes('word') || fileType.includes('document')) return '📝';
  if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
  if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '📋';
  if (fileType.includes('zip') || fileType.includes('rar')) return '📦';
  return '📎';
}

// تنسيق حجم الملف
function formatFileSize(bytes) {
  if (bytes === 0) return '0 بايت';
  
  const k = 1024;
  const sizes = ['بايت', 'كيلوبايت', 'ميجابايت', 'جيجابايت'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// === مستمعي أحداث الغرف والملفات ===

// معالجة أخطاء رفع الملفات
socket.on('file-upload-error', (error) => {
  showNotification(error.message, 'error');
  
  // إعادة تفعيل زر الرفع
  const uploadBtn = document.querySelector('.upload-btn');
  if (uploadBtn) {
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'رفع الملفات';
  }
});

// عند إنشاء غرفة بنجاح
socket.on('room-created', (roomData) => {
  addRoomToUI(roomData);
  showNotification(`تم إنشاء غرفة "${roomData.name}" بنجاح`, 'success');
});

// عند فشل إنشاء الغرفة
socket.on('room-creation-failed', (error) => {
  showNotification(`فشل في إنشاء الغرفة: ${error.message}`, 'error');
});

// عند تحديث قائمة الغرف
socket.on('rooms-updated', (rooms) => {
  availableRooms = rooms;
  updateRoomsUI();
});

// عند تحديث عدد الأعضاء في الغرفة
socket.on('room-members-updated', (data) => {
  if (availableRooms[data.roomId]) {
    availableRooms[data.roomId].members = data.count;
    
    const countElement = document.getElementById(`${data.roomId}-count`);
    if (countElement) {
      countElement.textContent = data.count;
    }
    
    if (data.roomId === currentRoom) {
      const currentRoomMembers = document.getElementById('currentRoomMembers');
      if (currentRoomMembers) {
        currentRoomMembers.textContent = `${data.count} أعضاء`;
      }
    }
  }
});

// تحديث واجهة جميع الغرف
function updateRoomsUI() {
  const roomsTabsContainer = document.getElementById('roomsTabs');
  if (!roomsTabsContainer) return;
  
  roomsTabsContainer.innerHTML = '';
  
  Object.keys(availableRooms).forEach(roomId => {
    const room = availableRooms[roomId];
    const roomTab = document.createElement('div');
    roomTab.className = 'room-tab';
    if (roomId === currentRoom) {
      roomTab.classList.add('active');
    }
    roomTab.dataset.room = roomId;
    roomTab.onclick = () => switchRoom(roomId);
    
    roomTab.innerHTML = `
      <span class="room-icon">${room.icon}</span>
      <span class="room-name">${room.name}</span>
      <span class="room-count" id="${roomId}-count">${room.members}</span>
    `;
    
    roomsTabsContainer.appendChild(roomTab);
  });
}

// === وظائف مشاركة الشاشة ومؤشرات الحالة ===

// متغيرات مشاركة الشاشة
let screenStream = null;
let isScreenSharing = false;

// بدء مشاركة الشاشة
async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    
    isScreenSharing = true;
    updateScreenStatus(true);
    
    // استبدال مسار الفيديو في الاتصال
    if (localPeerConnection && localStream) {
      const videoTrack = screenStream.getVideoTracks()[0];
      const sender = localPeerConnection.getSenders().find(s => 
        s.track && s.track.kind === 'video'
      );
      
      if (sender) {
        await sender.replaceTrack(videoTrack);
      }
    }
    
    // مراقبة انتهاء مشاركة الشاشة
    screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      stopScreenShare();
    });
    
    showNotification('تم بدء مشاركة الشاشة', 'success');
    
  } catch (error) {
    console.error('خطأ في مشاركة الشاشة:', error);
    showNotification('فشل في مشاركة الشاشة', 'error');
  }
}

// إيقاف مشاركة الشاشة
async function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  
  isScreenSharing = false;
  updateScreenStatus(false);
  
  // العودة للكاميرا العادية
  if (localPeerConnection && localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    const sender = localPeerConnection.getSenders().find(s => 
      s.track && s.track.kind === 'video'
    );
    
    if (sender && videoTrack) {
      await sender.replaceTrack(videoTrack);
    }
  }
  
  showNotification('تم إيقاف مشاركة الشاشة', 'info');
}

// تحديث مؤشر حالة الشاشة
function updateScreenStatus(isSharing) {
  const screenStatus = document.getElementById('screenStatus');
  const screenShareBtn = document.getElementById('screenShareBtn');
  
  if (screenStatus) {
    if (isSharing) {
      showElement(screenStatus, 'inline-block');
      screenStatus.classList.add('active');
    } else {
      hideElement(screenStatus);
      screenStatus.classList.remove('active');
    }
  }
  
  if (screenShareBtn) {
    screenShareBtn.textContent = isSharing ? '🛑 إيقاف المشاركة' : '🖥️ مشاركة الشاشة';
    screenShareBtn.onclick = isSharing ? stopScreenShare : startScreenShare;
  }
}

// تحديث مؤشر حالة الميكروفون
function updateMicStatus(isEnabled) {
  const micStatus = document.getElementById('micStatus');
  if (micStatus) {
    const statusText = micStatus.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = isEnabled ? 'مفعل' : 'مكتوم';
    }
    micStatus.classList.toggle('muted', !isEnabled);
  }
}

// تحديث مؤشر حالة الكاميرا
function updateCameraStatus(isEnabled) {
  const cameraStatus = document.getElementById('cameraStatus');
  if (cameraStatus) {
    const statusText = cameraStatus.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = isEnabled ? 'مفعل' : 'مغلق';
    }
    cameraStatus.classList.toggle('disabled', !isEnabled);
  }
}

// إظهار/إخفاء مؤشرات الحالة
function toggleMediaStatus(show) {
  const mediaStatus = document.getElementById('mediaStatus');
  const screenShareBtn = document.getElementById('screenShareBtn');
  
  if (mediaStatus) {
    mediaStatus.style.display = show ? 'block' : 'none';
  }
  
  if (screenShareBtn) {
    screenShareBtn.style.display = show ? 'inline-block' : 'none';
  }
}

// وظيفة إظهار شاشة الترحيب
function showWelcomeScreen() {
  const welcomeScreen = document.getElementById('welcomeScreen');
  const mainApp = document.getElementById('mainApp');
  
  if (welcomeScreen && mainApp) {
    welcomeScreen.style.display = 'flex';
    mainApp.style.display = 'none';
    
    // تحديث رسالة الترحيب
    const welcomeMessage = document.getElementById('welcomeMessage');
    if (welcomeMessage) {
      welcomeMessage.innerHTML = `
        <p>🏠 مرحباً بك في تطبيق الدردشة العائلية!</p>
        <p>يرجى إدخال اسمك للانضمام إلى العائلة</p>
      `;
    }
  }
}

// تم حذف الوظيفة المكررة - الوظيفة الأصلية موجودة في السطر 1763

// === التهيئة عند تحميل الصفحة ===

document.addEventListener('DOMContentLoaded', function() {
  // تطبيق الوضع المحفوظ
  applyTheme(currentTheme);
  
  // إعداد مستمع الكتابة
  const msgBox = document.getElementById('msgBox');
  if (msgBox) {
    msgBox.addEventListener('input', handleTyping);
    msgBox.addEventListener('input', function() {
      autoResizeTextarea(this);
    });
    
    // إرسال الرسالة بـ Enter (بدون Shift)
    msgBox.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
  
  // إظهار شاشة الترحيب افتراضياً
  showWelcomeScreen();
  
  // تفعيل الصوت عند أول تفاعل مع الصفحة
  let audioInitialized = false;
  function initializeAudioOnFirstClick() {
    if (!audioInitialized) {
      enableAudio();
      audioInitialized = true;
    }
  }
  
  // إضافة مستمعات للتفاعل الأول
  document.addEventListener('click', initializeAudioOnFirstClick, { once: true });
  document.addEventListener('keydown', initializeAudioOnFirstClick, { once: true });
  document.addEventListener('touchstart', initializeAudioOnFirstClick, { once: true });
  
  // إغلاق النوافذ المنبثقة عند النقر خارجها
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
      if (e.target.id === 'createRoomModal') {
        hideCreateRoomModal();
      } else if (e.target.id === 'fileShareModal') {
        hideFileShareModal();
      }
    }
  });
  
  // إغلاق إيموجي بيكر عند النقر خارجه
  document.addEventListener('click', function(e) {
    const emojiPicker = document.getElementById('emojiPicker');
    const emojiToggle = document.querySelector('.emoji-toggle');
    
    if (emojiPicker && !emojiPicker.contains(e.target) && e.target !== emojiToggle) {
      emojiPicker.style.display = 'none';
    }
  });
});

// === وظائف مشاركة الشاشة (محسنة) ===

// بدء مشاركة الشاشة
async function startScreenShare() {
  try {
    console.log('🖥️ بدء مشاركة الشاشة...');
    
    // التحقق من دعم المتصفح لمشاركة الشاشة
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('مشاركة الشاشة غير مدعومة في هذا المتصفح');
    }
    
    // الحصول على إذن مشاركة الشاشة
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: true // مشاركة صوت النظام أيضاً
    });
    
    console.log('✅ تم الحصول على مشاركة الشاشة');
    
    // استبدال الفيديو المحلي بمشاركة الشاشة
    if (localVideo) {
      localVideo.srcObject = screenStream;
    }
    
    // إذا كان هناك اتصال WebRTC نشط، استبدال المسار
    if (peerConnection && localStream) {
      const videoTrack = screenStream.getVideoTracks()[0];
      const sender = peerConnection.getSenders().find(s => 
        s.track && s.track.kind === 'video'
      );
      
      if (sender) {
        await sender.replaceTrack(videoTrack);
        console.log('🔄 تم استبدال مسار الفيديو بمشاركة الشاشة');
      }
    }
    
    isScreenSharing = true;
    updateScreenShareStatus(true);
    
    // مراقبة إنهاء مشاركة الشاشة من المستخدم
    screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      console.log('🛑 تم إنهاء مشاركة الشاشة من المستخدم');
      stopScreenShare();
    });
    
  } catch (error) {
    console.error('❌ خطأ في مشاركة الشاشة:', error);
    showNotification('فشل في بدء مشاركة الشاشة: ' + error.message, 'error');
  }
}

// إيقاف مشاركة الشاشة
async function stopScreenShare() {
  try {
    console.log('🛑 إيقاف مشاركة الشاشة...');
    
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      screenStream = null;
    }
    
    // العودة للكاميرا العادية إذا كانت المكالمة نشطة
    if (isCallActive && localStream) {
      if (localVideo) {
        localVideo.srcObject = localStream;
      }
      
      // استبدال المسار في WebRTC
      if (peerConnection) {
        const videoTrack = localStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        
        if (sender && videoTrack) {
          await sender.replaceTrack(videoTrack);
          console.log('🔄 تم العودة للكاميرا العادية');
        }
      }
    }
    
    isScreenSharing = false;
    updateScreenShareStatus(false);
    
  } catch (error) {
    console.error('❌ خطأ في إيقاف مشاركة الشاشة:', error);
  }
}

// تحديث حالة مشاركة الشاشة
function updateScreenShareStatus(sharing) {
  const screenShareBtn = document.getElementById('screenShareBtn');
  const screenStatus = document.getElementById('screenStatus');
  
  if (screenShareBtn) {
    if (sharing) {
      screenShareBtn.textContent = '🛑 إيقاف مشاركة الشاشة';
      screenShareBtn.onclick = stopScreenShare;
    } else {
      screenShareBtn.textContent = '🖥️ مشاركة الشاشة';
      screenShareBtn.onclick = startScreenShare;
    }
  }
  
  if (screenStatus) {
    if (sharing) {
      showElement(screenStatus, 'inline-flex');
      screenStatus.className = 'status-item active';
      screenStatus.querySelector('.status-text').textContent = 'نشط';
    } else {
      hideElement(screenStatus);
    }
  }
  
  // تحديث مؤشرات الحالة العامة
  updateMediaStatus();
}
