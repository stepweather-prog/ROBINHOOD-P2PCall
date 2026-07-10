// robincall-ui.js
let activeChannelId = null;
let selectedAvatar = '001';
let myNick = 'Лучник';
let theirNick = 'Незнакомец';
let theirAvatar = '001';
let toggleSoundState = true;

// WebRTC
let pc = null, stream = null, callActive = false, callStartTime = null, callTimerInterval = null;
let micOn = true, incomingOffer = null;
let archerAnim = null;

// Модалки
let verifyCode = '', verifyInput = '';

const audioPool = {};
const themes = [
    { id: 'forest', icon: '🌲', name: 'Лес' },
    { id: 'sunset', icon: '🌅', name: 'Закат' },
    { id: 'ocean', icon: '🌊', name: 'Океан' },
    { id: 'night-ember', icon: '🔥', name: 'Костёр' },
    { id: 'morning-mist', icon: '🌫️', name: 'Туман' }
];

function $(s) { return document.getElementById(s); }
function rMsg(m, t = 0) {
    const rm = $('robin-text');
    if (!rm) return;
    rm.textContent = m;
    if (t > 0) setTimeout(() => { if (rm.textContent === m) rm.textContent = 'Святые сокеты стабильны!'; }, t);
}
function playSound(f) {
    if (!toggleSoundState) return;
    if (!audioPool[f]) { audioPool[f] = new Audio('assets/sounds/' + f); audioPool[f].volume = 0.5; }
    const a = audioPool[f]; a.currentTime = 0; a.play().catch(() => {});
}
function closeSheets() {
    $('avatar-selector')?.classList.remove('show');
    $('settings-sheet')?.classList.remove('open');
    $('overlay')?.classList.remove('show');
}

// === Экраны ===
function showIdleScreen() {
    $('call-screen')?.classList.add('hidden');
    $('idle-screen')?.style.display = 'flex';
    $('incoming-row')?.classList.add('hidden');
    $('active-row')?.classList.add('hidden');
    $('call-timer')?.classList.add('hidden');
    if (archerAnim) { archerAnim.destroy(); archerAnim = null; }
    $('call-archer-container').innerHTML = '';
    $('btn-call-main')?.classList.remove('ringing');
}

function showCallScreen(type) {
    $('idle-screen').style.display = 'none';
    $('call-screen')?.classList.remove('hidden');
    $('call-peer-name').textContent = theirNick;
    $('call-peer-avatar').src = getAvatarUrl(theirAvatar);

    if (type === 'outgoing') {
        $('incoming-row')?.classList.add('hidden');
        $('active-row')?.classList.add('hidden');
        $('call-timer')?.classList.add('hidden');
        $('call-status-text').textContent = 'Вызов...';
        playArcherAnimation();
    } else if (type === 'incoming') {
        $('incoming-row')?.classList.remove('hidden');
        $('active-row')?.classList.add('hidden');
        $('call-timer')?.classList.add('hidden');
        $('call-status-text').textContent = 'Входящий звонок...';
        $('btn-call-main')?.classList.add('ringing');
        playArcherAnimation();
        playSound('melodi.mp3');
    } else if (type === 'active') {
        $('incoming-row')?.classList.add('hidden');
        $('active-row')?.classList.remove('hidden');
        $('call-timer')?.classList.remove('hidden');
        $('call-status-text').textContent = 'Разговор';
        playArcherAnimation();
        playSound('open.mp3');
    }
}

function playArcherAnimation() {
    const c = $('call-archer-container');
    if (!c) return;
    c.innerHTML = '';
    if (typeof lottie !== 'undefined') {
        archerAnim = lottie.loadAnimation({ container: c, renderer: 'canvas', loop: true, autoplay: true, path: 'assets/Archer.json' });
    } else {
        c.innerHTML = '<span style="font-size:100px;">🏹</span>';
    }
}

// === WebRTC ===
async function getMediaStream() {
    try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { rMsg('❌ Нет микрофона', 4000); return null; }
}

function createPC() {
    if (pc) { try { pc.close(); } catch (e) {}; pc = null; }
    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
    if (stream) stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.ontrack = e => { if (e.streams[0]) { const a = new Audio(); a.srcObject = e.streams[0]; a.play().catch(() => {}); } };
    pc.onicecandidate = e => {
        if (e.candidate && activeChannelId) P2PPong.sendMessage(activeChannelId, JSON.stringify({ webrtc: 'webrtc-ice', sdp: JSON.stringify(e.candidate) }));
    };
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') { callActive = true; startCallTimer(); showCallScreen('active'); }
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') { hang(false); }
    };
    return pc;
}

function startCallTimer() {
    callStartTime = Date.now();
    $('call-timer').classList.remove('hidden');
    callTimerInterval = setInterval(() => {
        const e = Math.floor((Date.now() - callStartTime) / 1000);
        $('call-timer').textContent = Math.floor(e / 60).toString().padStart(2, '0') + ':' + (e % 60).toString().padStart(2, '0');
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) clearInterval(callTimerInterval);
    $('call-timer').classList.add('hidden');
}

async function startCall() {
    if (callActive || !activeChannelId) { rMsg('⚠ Сначала подключись', 4000); return; }
    const s = await getMediaStream(); if (!s) { showIdleScreen(); return; }
    stream = s; createPC(); showCallScreen('outgoing');
    try {
        const o = await pc.createOffer(); await pc.setLocalDescription(o);
        P2PPong.sendMessage(activeChannelId, JSON.stringify({ webrtc: 'webrtc-offer', sdp: JSON.stringify(o) }));
    } catch (e) { hang(true); }
}

async function acceptCall() {
    if (!incomingOffer) return;
    const s = await getMediaStream(); if (!s) { showIdleScreen(); return; }
    stream = s; createPC(); showCallScreen('active');
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
        const a = await pc.createAnswer(); await pc.setLocalDescription(a);
        P2PPong.sendMessage(activeChannelId, JSON.stringify({ webrtc: 'webrtc-answer', sdp: JSON.stringify(a) }));
        incomingOffer = null; callActive = true; startCallTimer();
    } catch (e) { hang(true); }
}

function hang(sig = true) {
    callActive = false; stopCallTimer();
    if (activeChannelId && sig) {
        try { P2PPong.sendMessage(activeChannelId, JSON.stringify({ webrtc: 'webrtc-hangup', sdp: '' })); } catch (e) {}
    }
    if (pc) { try { pc.close(); } catch (e) {}; pc = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    incomingOffer = null; showIdleScreen(); playSound('exet.mp3');
}

function handleWebRTCSignal(type, sdp) {
    if (type === 'webrtc-offer' && !callActive) {
        try { incomingOffer = JSON.parse(sdp); showCallScreen('incoming'); rMsg('📞 Входящий!', 0); } catch (e) {}
        return;
    }
    if (type === 'webrtc-answer' && pc) {
        try {
            pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(sdp)))
              .then(() => { callActive = true; startCallTimer(); showCallScreen('active'); })
              .catch(() => {});
        } catch (e) {}
        return;
    }
    if (type === 'webrtc-ice' && pc) {
        try { pc.addIceCandidate(new RTCIceCandidate(JSON.parse(sdp))).catch(() => {}); } catch (e) {}
        return;
    }
    if (type === 'webrtc-hangup') {
        if (callActive || pc) { rMsg('📞 Собеседник завершил', 3000); hang(false); }
        return;
    }
}

// === Аватары ===
const avatarList = ['002','004','006','007','023','025','028','031','033','037','045','051','053','056','057','059','062','064','066','075','076','080','082','092','094','097','098','110','112','114','119','128','129','132','146','150','153','154','156','159','161','166','167'];
const avatars = avatarList.map(id => 'assets/avatar/' + id + 'ava.png');

function getAvatarUrl(src) {
    if (!src || src === '001') return 'assets/avatar/001ava.png';
    if (src.startsWith('assets/')) return src;
    return 'assets/avatar/' + src + 'ava.png';
}

function loadAvatars() {
    const list = $('avatar-list'); if (!list) return; list.innerHTML = '';
    avatars.forEach(src => {
        const img = document.createElement('img'); img.src = src; img.className = 'avatar-option';
        img.loading = 'lazy'; img.onerror = () => img.src = 'assets/avatar/001ava.png';
        img.onclick = () => {
            $('profile-avatar-small').src = src;
            $('robin-avatar').src = src;
            selectedAvatar = src.split('/').pop().replace('ava.png', '') || '001';
            localStorage.setItem('robinhood_avatar', src);
            P2PPong.setMyProfile(myNick, selectedAvatar);
            closeSheets(); rMsg('🖼 Аватар обновлён');
        };
        list.appendChild(img);
    });
}

// === Темы ===
function generateRandomTheme() {
    const hue = Math.floor(Math.random() * 360), sat = 40 + Math.floor(Math.random() * 50),
          bgLight = 5 + Math.floor(Math.random() * 15), bgDark = 2 + Math.floor(Math.random() * 8),
          id = 'random_' + Date.now();
    const s = `[data-theme="${id}"]{--bg-primary:hsl(${hue},${sat}%,${bgLight}%);--bg-secondary:hsl(${hue},${sat-10}%,${bgDark}%);--accent:hsl(${(hue+30)%360},${sat+10}%,50%);--accent-light:hsl(${(hue+30)%360},${sat+20}%,70%);--text:hsl(${hue},20%,85%);--text-bright:hsl(${hue},25%,92%);--text-dim:hsl(${hue},15%,60%);--border:hsl(${(hue+30)%360},${sat+10}%,50%);--robin-accent:hsl(${(hue+30)%360},${sat+20}%,65%);--seeding-color:#4caf50}`;
    let el = document.getElementById('gen-theme'); if (!el) { el = document.createElement('style'); el.id = 'gen-theme'; document.head.appendChild(el); }
    el.textContent = s; document.documentElement.setAttribute('data-theme', id);
    $('theme-name').textContent = 'Авто'; $('theme-icon').textContent = '🎲';
    localStorage.setItem('robinhood_theme', id);
}

function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id); localStorage.setItem('robinhood_theme', id);
    const t = themes.find(t => t.id === id);
    if (t) { $('theme-icon').textContent = t.icon; $('theme-name').textContent = t.name; }
    else { $('theme-icon').textContent = '🎲'; $('theme-name').textContent = 'Авто'; }
}

// === Верификация ===
function showVerifyModal(expectedCode) {
    verifyCode = expectedCode; verifyInput = '';
    $('verify-code-display').textContent = '_______'; $('verify-error').style.display = 'none';
    const grid = $('verify-code-grid'); grid.innerHTML = '';
    for (let i = 1; i <= 9; i++) { const btn = document.createElement('button'); btn.textContent = i; btn.className = 'lock-num'; btn.onclick = () => addVerifyDigit(i.toString()); grid.appendChild(btn); }
    const btn0 = document.createElement('button'); btn0.textContent = '0'; btn0.className = 'lock-num'; btn0.onclick = () => addVerifyDigit('0'); grid.appendChild(btn0);
    const btnDel = document.createElement('button'); btnDel.textContent = '⌫'; btnDel.className = 'lock-num'; btnDel.style.background = 'rgba(244,67,54,0.3)'; btnDel.onclick = () => { verifyInput = verifyInput.slice(0, -1); $('verify-code-display').textContent = verifyInput.padEnd(7, '_'); }; grid.appendChild(btnDel);
    $('verify-modal')?.classList.add('active');
}

function addVerifyDigit(d) {
    if (verifyInput.length >= 7) return; verifyInput += d;
    $('verify-code-display').textContent = verifyInput.padEnd(7, '_');
    if (verifyInput.length === 7) setTimeout(() => $('btn-verify-confirm')?.click(), 300);
}

// === Инициализация ===
function initUI() {
    P2PPong.on('ready', () => {
        rMsg('🏹 Колчан готов!', 0);
        showIdleScreen();
    });

    P2PPong.on('peer-id-generated', d => {
        $('craft-beacon-display').style.display = 'block';
        $('craft-beacon-display').textContent = d.beaconId;
        $('craft-code-display').style.display = 'block';
        $('craft-code-display').textContent = d.code;
        $('btn-copy-link').style.display = 'block';
        rMsg('✅ Стрела создана!', 3000);
        navigator.clipboard.writeText(d.beaconId + '\n' + d.code).catch(() => {});
    });

    P2PPong.on('verification-needed', d => { showVerifyModal(d.code); });

    P2PPong.on('channel-opened', d => {
        activeChannelId = d.channelId;
        if (d.nick) theirNick = d.nick;
        if (d.avatar) theirAvatar = d.avatar;
        showIdleScreen();
        rMsg('✅ Колчан открыт! Тетива натянута!', 3000);
        $('verify-modal')?.classList.remove('active');
        $('craft-modal')?.classList.remove('active');
    });

    P2PPong.on('message-received', d => {
        if (!d.text) return;
        if (d.text.indexOf('"webrtc"') > -1) {
            try { const p = JSON.parse(d.text); if (p.webrtc) handleWebRTCSignal(p.webrtc, p.sdp); } catch (e) {}
        }
    });

    P2PPong.on('error', d => { rMsg('❌ ' + (d.message || 'Ошибка'), 5000); });
}

function initApp() {
    const savedTheme = localStorage.getItem('robinhood_theme');
    if (savedTheme && themes.find(t => t.id === savedTheme)) applyTheme(savedTheme); else generateRandomTheme();

    const savedAvatar = localStorage.getItem('robinhood_avatar');
    if (savedAvatar) {
        $('profile-avatar-small').src = savedAvatar;
        $('robin-avatar').src = savedAvatar;
        selectedAvatar = savedAvatar.split('/').pop()?.replace('ava.png', '') || '001';
    }

    const savedNick = localStorage.getItem('robinhood_nick');
    if (savedNick) { myNick = savedNick.substring(0, 12); $('nick-label').textContent = myNick; }
    P2PPong.setMyProfile(myNick, selectedAvatar);

    toggleSoundState = localStorage.getItem('robinhood_sound') !== 'false';
    $('toggle-sound').checked = toggleSoundState;

    // Кнопки шапки
    $('btn-avatar')?.addEventListener('click', () => { closeSheets(); loadAvatars(); $('avatar-selector')?.classList.add('show'); $('overlay')?.classList.add('show'); });
    $('btn-craft')?.addEventListener('click', () => $('craft-modal')?.classList.add('active'));
    $('btn-clear')?.addEventListener('click', () => {
        hang(false); activeChannelId = null; showIdleScreen();
        rMsg('🚬 Всё сожжено!', 5000); localStorage.clear();
    });
    $('btn-settings')?.addEventListener('click', () => { closeSheets(); $('settings-sheet')?.classList.add('open'); $('overlay')?.classList.add('show'); });
    $('settings-close')?.addEventListener('click', closeSheets);
    $('overlay')?.addEventListener('click', closeSheets);

    // Ник
    $('nick-label')?.addEventListener('click', () => { $('nick-input').value = myNick; $('nick-modal')?.classList.add('active'); });
    $('btn-nick-cancel')?.addEventListener('click', () => $('nick-modal')?.classList.remove('active'));
    $('btn-nick-save')?.addEventListener('click', () => {
        const n = $('nick-input').value.trim().substring(0, 12);
        if (n) { myNick = n; $('nick-label').textContent = n; localStorage.setItem('robinhood_nick', n); P2PPong.setMyProfile(n, selectedAvatar); }
        $('nick-modal')?.classList.remove('active');
    });

    // Крафт
    $('btn-craft-arrow')?.addEventListener('click', () => P2PPong.craftArrow());
    $('btn-copy-link')?.addEventListener('click', () => {
        const bid = $('craft-beacon-display')?.textContent, code = $('craft-code-display')?.textContent;
        if (bid) navigator.clipboard.writeText(bid + '\n' + code).then(() => rMsg('📋 Скопировано!', 2000));
    });
    $('btn-join')?.addEventListener('click', () => {
        const raw = $('join-input')?.value.trim(); if (!raw) { rMsg('⚠ Вставь Beacon ID', 3000); return; }
        P2PPong.joinBeacon(raw.split('\n')[0]?.trim()); $('craft-modal')?.classList.remove('active');
    });
    $('btn-close-craft')?.addEventListener('click', () => $('craft-modal')?.classList.remove('active'));

    // Поле ввода на главном экране
    $('btn-main-join')?.addEventListener('click', () => {
        const raw = $('main-join-input')?.value.trim(); if (!raw) { rMsg('⚠ Вставь Beacon ID', 3000); return; }
        P2PPong.joinBeacon(raw.split('\n')[0]?.trim());
    });
    $('main-join-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') $('btn-main-join')?.click(); });

    // Вызов
    $('btn-call-main')?.addEventListener('click', () => callActive ? hang(true) : startCall());
    $('btn-answer')?.addEventListener('click', acceptCall);
    $('btn-reject')?.addEventListener('click', () => {
        if (incomingOffer) { P2PPong.sendMessage(activeChannelId, JSON.stringify({ webrtc: 'webrtc-hangup', sdp: '' })); incomingOffer = null; }
        showIdleScreen();
    });
    $('btn-end-call')?.addEventListener('click', () => hang(true));
    $('btn-mic')?.addEventListener('click', () => {
        if (stream) { micOn = !micOn; stream.getAudioTracks().forEach(t => t.enabled = micOn); $('btn-mic').textContent = micOn ? '🎤' : '🔇'; }
    });
    $('btn-speaker')?.addEventListener('click', () => { $('btn-speaker').textContent = $('btn-speaker').textContent === '🔊' ? '🔈' : '🔊'; });

    // Верификация
    $('btn-verify-confirm')?.addEventListener('click', () => {
        if (verifyInput.length !== 7) { $('verify-error').style.display = 'block'; $('verify-error').textContent = 'Введи ровно 7 цифр'; return; }
        if (verifyInput === verifyCode) { $('verify-error').style.display = 'none'; $('verify-modal')?.classList.remove('active'); P2PPong.confirmVerification(); }
        else { $('verify-error').style.display = 'block'; $('verify-error').textContent = '❌ Неверный код'; verifyInput = ''; $('verify-code-display').textContent = '_______'; }
    });
    $('btn-verify-reset')?.addEventListener('click', () => { verifyInput = ''; $('verify-code-display').textContent = '_______'; });
    $('btn-close-verify')?.addEventListener('click', () => $('verify-modal')?.classList.remove('active'));

    // Настройки
    $('setting-theme')?.addEventListener('click', generateRandomTheme);
    $('setting-sound')?.querySelector('input')?.addEventListener('change', function () { toggleSoundState = this.checked; localStorage.setItem('robinhood_sound', toggleSoundState); });

    showIdleScreen(); rMsg('🏹 Колчан готов!', 3000);
}

P2PPong.on('ready', () => { initUI(); initApp(); });
P2PPong.init();