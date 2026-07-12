// robincall.js — звонки через P2PPong

let channelId = null;
let pc = null, stream = null, callActive = false;
let incomingOffer = null;
let micOn = true, speakerOn = true;
let callTimer = null, callStart = null;

// Audio
let audioCtx = null, gainNode = null;
const remoteAudio = document.createElement('audio');
remoteAudio.autoplay = true;
document.body.appendChild(remoteAudio);

// WebRTC config
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:robinhoodp2p.metered.live:3478?transport=udp', 
          username: '466624d8364bb4660ed45c7d', credential: 'mpODzmBDhwG/b+VL' },
        { urls: 'turn:robinhoodp2p.metered.live:443?transport=tcp', 
          username: '466624d8364bb4660ed45c7d', credential: 'mpODzmBDhwG/b+VL' }
    ]
};

// === UI ===
function showScreen(screen, data) {
    const idle = document.getElementById('idle-screen');
    const call = document.getElementById('call-screen');
    const incoming = document.getElementById('incoming-buttons');
    const outgoing = document.getElementById('outgoing-button');
    const active = document.getElementById('active-buttons');
    const timer = document.getElementById('call-timer');
    const status = document.getElementById('call-status');
    
    idle.style.display = screen === 'idle' ? 'flex' : 'none';
    call.style.display = screen !== 'idle' ? 'flex' : 'none';
    
    incoming.classList.add('hidden');
    outgoing.classList.add('hidden');
    active.classList.add('hidden');
    timer.classList.add('hidden');
    
    if (screen === 'incoming') {
        incoming.classList.remove('hidden');
        status.textContent = 'Входящий звонок...';
        document.getElementById('call-name').textContent = data?.nick || 'Лучник';
    } else if (screen === 'outgoing') {
        outgoing.classList.remove('hidden');
        status.textContent = 'Вызов...';
    } else if (screen === 'active') {
        active.classList.remove('hidden');
        timer.classList.remove('hidden');
        status.textContent = 'Разговор';
        startTimer();
    }
}

function startTimer() {
    callStart = Date.now();
    document.getElementById('call-timer').textContent = '00:00';
    callTimer = setInterval(() => {
        const sec = Math.floor((Date.now() - callStart) / 1000);
        document.getElementById('call-timer').textContent = 
            String(Math.floor(sec / 60)).padStart(2, '0') + ':' + 
            String(sec % 60).padStart(2, '0');
    }, 1000);
}

function stopTimer() {
    if (callTimer) clearInterval(callTimer);
}

function setStatus(text) {
    document.getElementById('status-text').textContent = text;
}

// === Канал ===
async function craftChannel() {
    const beaconId = await P2PPong.craftArrow();
    document.getElementById('craft-id').textContent = beaconId;
    const code = P2PPong.getVerificationCode();
    if (code) {
        document.getElementById('craft-code').textContent = code;
        document.getElementById('craft-code').classList.remove('hidden');
    }
    setStatus('Канал создан, ждем друга...');
}

async function joinChannel() {
    const id = document.getElementById('join-input').value.trim();
    if (id) {
        await P2PPong.joinBeacon(id);
        setStatus('Подключаемся...');
    }
}

function copyCraft() {
    const id = document.getElementById('craft-id').textContent;
    const code = document.getElementById('craft-code').textContent;
    const text = id + (code ? '\n' + code : '');
    if (id) navigator.clipboard.writeText(text).catch(() => {});
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function handleMainAction() {
    if (channelId) {
        // Канал есть — звоним
        if (!callActive) makeCall();
        else hangup(true);
    } else {
        // Нет канала — создаем
        document.getElementById('craft-modal').classList.add('active');
        document.getElementById('craft-id').textContent = P2PPong._beaconId || '';
    }
}

// === Верификация ===
let verifyInput = '';
let verifyCode = '';

function showVerifyModal(code) {
    verifyCode = code;
    verifyInput = '';
    document.getElementById('verify-display').textContent = '_______';
    
    const grid = document.getElementById('verify-grid');
    grid.innerHTML = '';
    for (let i = 1; i <= 9; i++) {
        const btn = document.createElement('button');
        btn.className = 'verify-btn';
        btn.textContent = i;
        btn.onclick = () => addDigit(i);
        grid.appendChild(btn);
    }
    const btn0 = document.createElement('button');
    btn0.className = 'verify-btn'; btn0.textContent = '0';
    btn0.onclick = () => addDigit(0);
    grid.appendChild(btn0);
    
    const btnDel = document.createElement('button');
    btnDel.className = 'verify-btn'; btnDel.textContent = '⌫';
    btnDel.style.background = 'rgba(244,67,54,0.3)';
    btnDel.onclick = () => {
        verifyInput = verifyInput.slice(0, -1);
        document.getElementById('verify-display').textContent = verifyInput.padEnd(7, '_');
    };
    grid.appendChild(btnDel);
    
    document.getElementById('verify-modal').classList.add('active');
}

function addDigit(d) {
    if (verifyInput.length >= 7) return;
    verifyInput += d;
    document.getElementById('verify-display').textContent = verifyInput.padEnd(7, '_');
    if (verifyInput.length === 7) confirmVerify();
}

function confirmVerify() {
    if (verifyInput === verifyCode) {
        closeModal('verify-modal');
        P2PPong.confirmVerification();
        setStatus('✅ Подтверждено!');
    }
}

// === WebRTC ===
async function initWebRTC() {
    cleanupWebRTC();
    
    stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true }, 
        video: false 
    });
    
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioCtx.createGain();
        gainNode.gain.value = speakerOn ? 1 : 0.1;
        gainNode.connect(audioCtx.destination);
    }
    
    pc = new RTCPeerConnection(rtcConfig);
    
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    
    pc.ontrack = (e) => {
        if (e.streams[0]) {
            const src = audioCtx.createMediaStreamSource(e.streams[0]);
            src.connect(gainNode);
            remoteAudio.srcObject = e.streams[0];
            remoteAudio.play().catch(() => {});
        }
    };
    
    pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal({ type: 'candidate', candidate: e.candidate });
    };
    
    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            hangup(false);
        }
    };
}

function cleanupWebRTC() {
    if (pc) { pc.close(); pc = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    remoteAudio.srcObject = null;
}

function sendSignal(payload) {
    if (!channelId) return;
    // Отправляем через sendMessage (шифрованный канал)
    P2PPong.sendMessage(channelId, JSON.stringify({
        type: 'rtc_signal',
        signal: payload
    }));
}

async function makeCall() {
    callActive = true;
    showScreen('outgoing');
    
    await initWebRTC();
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    
    // Ждем ICE gathering
    if (pc.iceGatheringState !== 'complete') {
        await new Promise(r => {
            pc.onicegatheringstatechange = () => {
                if (pc.iceGatheringState === 'complete') r();
            };
        });
    }
    
    sendSignal({ type: 'offer', offer: pc.localDescription });
}

async function acceptCall() {
    if (!incomingOffer) return;
    
    callActive = true;
    showScreen('active');
    
    await initWebRTC();
    await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
    const answer = await pc.createAnswer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(answer);
    
    if (pc.iceGatheringState !== 'complete') {
        await new Promise(r => {
            pc.onicegatheringstatechange = () => {
                if (pc.iceGatheringState === 'complete') r();
            };
        });
    }
    
    sendSignal({ type: 'answer', answer: pc.localDescription });
    incomingOffer = null;
}

function hangup(isInitiator) {
    stopTimer();
    if (isInitiator && channelId) {
        sendSignal({ type: 'hangup' });
    }
    cleanupWebRTC();
    callActive = false;
    incomingOffer = null;
    showScreen('idle');
}

function handleSignal(signal) {
    switch (signal.type) {
        case 'offer':
            if (callActive) { sendSignal({ type: 'hangup' }); return; }
            incomingOffer = signal.offer;
            showScreen('incoming', { nick: 'Лучник' });
            break;
        case 'answer':
            if (pc && callActive) {
                pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
                showScreen('active');
            }
            break;
        case 'candidate':
            if (pc && signal.candidate) {
                pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
            }
            break;
        case 'hangup':
            hangup(false);
            break;
    }
}

function toggleMic() {
    if (stream) {
        micOn = !micOn;
        stream.getAudioTracks().forEach(t => t.enabled = micOn);
        document.getElementById('btn-mic').textContent = micOn ? '🎤' : '🔇';
    }
}

function toggleSpeaker() {
    speakerOn = !speakerOn;
    if (gainNode) gainNode.gain.value = speakerOn ? 1 : 0.1;
    document.getElementById('btn-speaker').textContent = speakerOn ? '🔊' : '🔈';
}

// === Инициализация ===
P2PPong.on('ready', () => {
    setStatus('Готов к звонкам');
});

P2PPong.on('channel-opened', (d) => {
    channelId = d.channelId;
    closeModal('craft-modal');
    closeModal('verify-modal');
    setStatus('✅ Канал открыт! Можно звонить.');
    document.getElementById('btn-main').style.borderColor = '#4caf50';
});

P2PPong.on('verification-needed', (d) => {
    showVerifyModal(d.code);
});

P2PPong.on('message-received', (d) => {
    if (d.from !== 'them') return;
    try {
        const msg = JSON.parse(d.text || '{}');
        if (msg.type === 'rtc_signal' && msg.signal) {
            handleSignal(msg.signal);
        }
    } catch(e) {}
});

P2PPong.on('channel-expired', (d) => {
    if (d.channelId === channelId) {
        channelId = null;
        hangup(false);
        setStatus('Канал истек');
        document.getElementById('btn-main').style.borderColor = '';
    }
});

P2PPong.init();
