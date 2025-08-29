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
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  
  // إضافة مستمع للضغط على Enter في اسم الضيف
  if (guestNameInput) {
    guestNameInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        joinFamily();
      }
    });
  }
  
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
socket.on('users-update', (users) => {
  const count = users.length;
  userCount.textContent = `المتصلين: ${count}`;
  
  usersList.innerHTML = '';
  users.forEach(userId => {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    userElement.textContent = userId === socket.id ? 'أنت' : `مستخدم ${userId.substring(0, 6)}`;
    usersList.appendChild(userElement);
  });
  
  // تمكين أزرار المكالمة إذا كان هناك أكثر من مستخدم
  updateCallButtons(count > 1 && !isCallActive);
});

// === وظائف الرسائل النصية ===
function sendMessage() {
  const msg = msgBox.value.trim();
  if (msg) {
    socket.emit("chat-message", msg);
    msgBox.value = "";
    msgBox.focus();
  }
}

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
  
  // تأثير صوتي بسيط للرسائل الجديدة (اختياري)
  if (!isOwnMessage) {
    playNotificationSound();
  }
});

// === وظائف مكالمات الفيديو ===
async function startCall() {
  isVideoCall = true;
  await initializeCall();
}

async function startAudioCall() {
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
      remoteVideo.srcObject = remoteStream;
      
      // تشغيل الفيديو البعيد
      remoteVideo.play().then(() => {
        console.log('✅ تم تشغيل الفيديو البعيد بنجاح');
        updateCallStatus('المكالمة متصلة', 'connected');
      }).catch(err => {
        console.error('❌ خطأ في تشغيل الفيديو البعيد:', err);
      });
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
      } else if (peerConnection.iceConnectionState === 'disconnected') {
        console.log('⚠️ انقطع اتصال ICE مؤقتاً');
        updateCallStatus('إعادة الاتصال...', 'warning');
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
      remoteVideo.srcObject = remoteStream;
      
      // تشغيل الفيديو البعيد
      remoteVideo.play().then(() => {
        console.log('✅ تم تشغيل الفيديو البعيد للرد بنجاح');
        updateCallStatus('المكالمة متصلة', 'connected');
      }).catch(err => {
        console.error('❌ خطأ في تشغيل الفيديو البعيد للرد:', err);
      });
      
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
      } else if (peerConnection.iceConnectionState === 'disconnected') {
        console.log('⚠️ انقطع اتصال ICE للرد مؤقتاً');
        updateCallStatus('إعادة الاتصال...', 'warning');
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
    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('✅ تم تعيين الوصف البعيد للإجابة');
  } catch (error) {
    console.error('❌ خطأ في معالجة الإجابة:', error);
    updateCallStatus('فشل في الاتصال', 'error');
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
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  
  // تحديث الواجهة
  isCallActive = false;
  updateCallStatus('', '');
  updateCallButtons(true); // هذا سيخفي زر إنهاء المكالمة ويظهر أزرار البدء
  
  // إشعار الطرف الآخر
  socket.emit("end-call", { to: "all" });
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
    
    // انتظار 10 ثوان قبل إنهاء المكالمة
    setTimeout(() => {
      if (isCallActive) {
        console.log('⏰ انتهت مهلة الانتظار، إنهاء المكالمة');
        updateCallStatus('انقطع الاتصال', 'error');
        endCall();
      }
    }, 10000);
  }
});

// تنظيف الموارد عند إغلاق الصفحة
window.addEventListener('beforeunload', () => {
  if (isCallActive) {
    endCall();
  }
});

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

// === وظائف الدعوة ===

// إظهار شاشة الترحيب للمدعوين
function showWelcomeScreen(inviteCode) {
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
  guestName = guestNameInput.value.trim() || 'ضيف';
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
  
  familyName = familyNameInput.value.trim() || 'العائلة';
  const baseUrl = window.location.origin + window.location.pathname.replace(/\/$/, '');
  
  console.log('إرسال طلب إنشاء دعوة:', { familyName, baseUrl });
  
  socket.emit('create-invite', {
    familyName: familyName,
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
