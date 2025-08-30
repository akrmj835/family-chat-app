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

// متغيرات التحسينات الجديدة
let callStartTime = null;
let callTimerInterval = null;
let typingTimeout = null;
let isTyping = false;
let currentTheme = localStorage.getItem('theme') || 'light';

// تهيئة التطبيق عند التحميل
document.addEventListener('DOMContentLoaded', function() {
  // تعريف عناصر الدعوة
  welcomeScreen = document.getElementById("welcomeScreen");
  mainApp = document.getElementById("mainApp");
  welcomeMessage = document.getElementById("welcomeMessage");
  guestNameInput = document.getElementById("guestNameInput");
  familyNameInput = document.getElementById("familyNameInput");
  inviteResult = document.getElementById("inviteResult");
  mobileInviteLinkText = document.getElementById("mobileInviteLinkText");
  localInviteLinkText = document.getElementById("localInviteLinkText");
  
  // تطبيق الوضع المحفوظ
  applyTheme(currentTheme);
  
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
  
  const isOwnMessage = data.id === socket.id;
  const senderName = isOwnMessage ? 'أنت' : `مستخدم ${data.id.substring(0, 6)}`;
  
  messageDiv.innerHTML = `
    <div class="sender">${senderName}</div>
    <div class="text">${escapeHtml(data.text)}</div>
    <div class="time">${data.timestamp}</div>
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
}

async function initializeCall() {
  try {
    updateCallStatus('جاري بدء المكالمة...', 'calling');
    
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
    
    updateCallStatus('في انتظار الرد...', 'calling');
    
    // إظهار زر إنهاء المكالمة فور بدء المكالمة
    isCallActive = true;
    showEndCallButton();
    
  } catch (error) {
    console.error('خطأ في بدء المكالمة:', error);
    updateCallStatus('فشل في بدء المكالمة', 'error');
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
  startCallBtn.disabled = !enabled;
  startAudioBtn.disabled = !enabled;
  
  if (enabled) {
    startCallBtn.style.opacity = '1';
    startAudioBtn.style.opacity = '1';
    startCallBtn.style.display = 'inline-block';
    startAudioBtn.style.display = 'inline-block';
    endCallBtn.style.display = 'none';
  } else {
    startCallBtn.style.opacity = '0.5';
    startAudioBtn.style.opacity = '0.5';
  }
}

// وظيفة منفصلة لإظهار زر إنهاء المكالمة
function showEndCallButton() {
  startCallBtn.style.display = 'none';
  startAudioBtn.style.display = 'none';
  endCallBtn.style.display = 'inline-block';
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
    
    console.log(isVideoEnabled ? '📹 تم تشغيل الفيديو' : '📷 تم إيقاف الفيديو');
  }
}

// تعديل التكبير
function adjustZoom(value) {
  currentZoom = parseFloat(value);
  const zoomValue = document.getElementById('zoomValue');
  zoomValue.textContent = currentZoom.toFixed(1) + 'x';
  
  localVideo.style.transform = `scale(${currentZoom})`;
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
    capturedPhotosDiv.style.display = 'block';
    
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
    settingsBtn.style.display = 'block';
    console.log('🎛️ تم إظهار زر إعدادات الكاميرا');
  } else {
    console.warn('⚠️ لم يتم العثور على زر إعدادات الكاميرا');
  }
}

function hideCameraControls() {
  const settingsBtn = document.getElementById('cameraSettingsBtn');
  const controlsPanel = document.getElementById('cameraControlsPanel');
  
  if (settingsBtn) {
    settingsBtn.style.display = 'none';
  }
  if (controlsPanel) {
    controlsPanel.style.display = 'none';
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
  
  const isVisible = controlsPanel.style.display === 'block';
  
  if (isVisible) {
    controlsPanel.style.display = 'none';
    console.log('🎛️ تم إخفاء لوحة التحكم');
  } else {
    controlsPanel.style.display = 'block';
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
function playNotificationSound() {
  // إنشاء صوت إشعار بسيط
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
}

function playJoinSound() {
  // صوت انضمام عضو جديد
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
}

function playLeaveSound() {
  // صوت مغادرة عضو
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
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

// إظهار/إخفاء الإيموجي بيكر
function toggleEmojiPicker() {
  const emojiPicker = document.getElementById('emojiPicker');
  emojiPicker.classList.toggle('show');
}

// إضافة إيموجي للرسالة
function addEmoji(emoji) {
  const msgBox = document.getElementById('msgBox');
  const cursorPos = msgBox.selectionStart;
  const textBefore = msgBox.value.substring(0, cursorPos);
  const textAfter = msgBox.value.substring(cursorPos);
  
  msgBox.value = textBefore + emoji + textAfter;
  msgBox.focus();
  msgBox.setSelectionRange(cursorPos + emoji.length, cursorPos + emoji.length);
  
  // إخفاء الإيموجي بيكر
  document.getElementById('emojiPicker').classList.remove('show');
  
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
  qualityElement.style.display = 'flex';
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
  
  welcomeScreen.style.display = 'flex';
  mainApp.style.display = 'none';
  
  // التحقق من صحة رابط الدعوة
  socket.emit('validate-invite', inviteCode);
}

// إظهار التطبيق الرئيسي
function showMainApp() {
  welcomeScreen.style.display = 'none';
  mainApp.style.display = 'block';
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
  
  // إرسال طلب الانضمام مع كلمة المرور
  socket.emit('join-room', {
    guestName: guestName,
    password: enteredPassword,
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
  
  console.log('إرسال طلب إنشاء دعوة:', { familyName, hasPassword: !!roomPassword, baseUrl });
  
  socket.emit('create-invite', {
    familyName: familyName,
    roomPassword: roomPassword,
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
    inviteResult.style.display = 'block';
    
    // تحديث النص ليشمل اسم العائلة
    const inviteInfo = inviteResult.querySelector('.invite-info p');
    if (inviteInfo) {
      inviteInfo.innerHTML = `<strong>رابط دعوة "${data.familyName}" جاهز! 🎉</strong>`;
    }
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

// === معالجات الأحداث الجديدة ===

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

// تحديث وظائف المكالمة لتشمل المؤقت والجودة
const originalStartCall = startCall;
startCall = async function() {
  await originalStartCall.call(this);
  
  // بدء المؤقت عند بدء المكالمة
  if (isCallActive) {
    startCallTimer();
    updateConnectionQuality('excellent'); // افتراضي
    
    // مراقبة جودة الاتصال
    if (peerConnection) {
      setInterval(() => {
        peerConnection.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
              const packetsLost = report.packetsLost || 0;
              const packetsReceived = report.packetsReceived || 0;
              const lossRate = packetsLost / (packetsLost + packetsReceived);
              
              let quality = 'excellent';
              if (lossRate > 0.05) quality = 'poor';
              else if (lossRate > 0.02) quality = 'good';
              else if (lossRate > 0.01) quality = 'good';
              
              updateConnectionQuality(quality);
            }
          });
        });
      }, 5000);
    }
  }
};

const originalEndCall = endCall;
endCall = function() {
  stopCallTimer();
  
  const qualityElement = document.getElementById('connectionQuality');
  if (qualityElement) {
    qualityElement.style.display = 'none';
  }
  
  originalEndCall.call(this);
};
