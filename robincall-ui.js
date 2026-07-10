// robincall-ui.js
let activeChannelId = null;
let selectedAvatar = 'icons/01icon.png';
let myNick = 'Лучник';
let theirNick = 'Незнакомец';
let theirAvatar = '001';
let toggleSoundState = true;
let toggleAnimations = true;
let archerAnimation, quiverAnim, currentArrowContainer;
let verificationModalShown = false, verificationDone = false;
let deferredPrompt = null;

const audioPool = {};
const robinDefaultText = 'Святые сокеты стабильны!';
let robinTimer = null;

// WebRTC
let pc = null, stream = null, callActive = false, callStartTime = null, callTimerInterval = null;
let micOn = true, incomingOffer = null;
let callArcherAnim = null;

const videoBackgrounds = [
    { type: 'image', src: 'assets/icons/background.webp', name: 'Статика' },
    { type: 'video', src: 'assets/icons/background.webm', name: 'Неон' },
    { type: 'video', src: 'assets/icons/background2.webm', name: 'Робин' },
    { type: 'video', src: 'assets/icons/background3.webm', name: 'Листва' },
];
let currentBgIndex = 0;

const avatarList = ['002','004','006','007','023','025','028','031','033','037','045','051','053','056','057','059','062','064','066','075','076','080','082','092','094','097','098','110','112','114','119','128','129','132','146','150','153','154','156','159','161','166','167'];
const avatars = avatarList.map(id => 'assets/avatar/' + id + 'ava.png');

const themes = [
    { id: 'forest', name: 'Лес' }, { id: 'sunset', name: 'Закат' }, { id: 'ocean', name: 'Океан' },
    { id: 'rose', name: 'Роза' }, { id: 'amber', name: 'Янтарь' }, { id: 'mint', name: 'Мята' },
    { id: 'lavender', name: 'Лаванда' }, { id: 'cherry', name: 'Вишня' }, { id: 'emerald', name: 'Изумруд' },
    { id: 'slate', name: 'Сланец' }, { id: 'coral', name: 'Коралл' }, { id: 'plum', name: 'Слива' }
];

function $(s) { return document.getElementById(s); }
function rMsg(t, d = 4000) { const rt = $('robin-text'); if (!rt) return; clearTimeout(robinTimer); rt.textContent = t; if (d > 0) robinTimer = setTimeout(() => { rt.textContent = robinDefaultText; }, d); }
function playSound(f) { if (!toggleSoundState) return; if (!audioPool[f]) { audioPool[f] = new Audio('assets/sounds/' + f); audioPool[f].volume = 0.5; audioPool[f].preload = 'auto'; } const a = audioPool[f]; a.currentTime = 0; a.play().catch(e => {}); }
function closeSheets() { $('avatar-selector')?.classList.remove('show'); $('settings-sheet')?.classList.remove('open'); $('overlay')?.classList.remove('show'); }

// === Анимации ===
function playSmokeAnimation() { if (!toggleAnimations) return; const smoke = document.createElement('div'); smoke.className = 'smoke-anim'; document.body.appendChild(smoke); if (typeof lottie !== 'undefined') { try { lottie.loadAnimation({ container: smoke, renderer: 'canvas', loop: false, autoplay: true, path: 'assets/smoke.json' }); } catch (e) {} } setTimeout(() => { if (smoke.parentNode) smoke.remove(); }, 5000); }

function playArcherAnimation() {
    if (!toggleAnimations) return;
    const rt = $('robin-text'); if (!rt) return;
    if (currentArrowContainer?.parentNode) currentArrowContainer.remove();
    if (archerAnimation) { archerAnimation.destroy(); archerAnimation = null; }
    const wrapper = document.createElement('span');
    wrapper.className = 'robin-arrow-container';
    wrapper.style.cssText = 'width:120px;height:60px;display:inline-block;vertical-align:middle;';
    currentArrowContainer = wrapper;
    rt.textContent = '';
    rt.appendChild(wrapper);
    if (typeof lottie !== 'undefined') {
        try { archerAnimation = lottie.loadAnimation({ container: wrapper, renderer: 'canvas', loop: false, autoplay: true, path: 'assets/Archer.json' });
            archerAnimation.addEventListener('complete', () => { if (wrapper.parentNode) wrapper.remove(); currentArrowContainer = null; archerAnimation = null; rt.textContent = robinDefaultText; });
        } catch (e) { wrapper.textContent = '🏹'; wrapper.style.fontSize = '40px'; setTimeout(() => { if (wrapper.parentNode) wrapper.remove(); currentArrowContainer = null; rt.textContent = robinDefaultText; }, 1500); }
    } else { wrapper.textContent = '🏹'; wrapper.style.fontSize = '40px'; setTimeout(() => { if (wrapper.parentNode) wrapper.remove(); currentArrowContainer = null; rt.textContent = robinDefaultText; }, 1500); }
}

function playQuiverAnimation() {
    if (!toggleAnimations) return;
    const quiver = document.createElement('div'); quiver.className = 'quiver-anim';
    const img = document.createElement('img');
    img.src = 'assets/docking.gif?t=' + Date.now();
    img.style.cssText = 'width:min(200px,40vw);height:min(200px,40vw);object-fit:contain;filter:drop-shadow(0 0 20px rgba(255,215,0,0.8));';
    img.loading = 'lazy';
    img.onerror = () => { quiver.innerHTML = '<div style="font-size:min(120px,25vw);animation:quiverPulse 0.5s ease-in-out 7;">🏹</div>'; };
    quiver.appendChild(img);
    document.body.appendChild(quiver);
    setTimeout(() => { quiver.style.opacity = '0'; quiver.style.transition = 'opacity 0.5s ease'; setTimeout(() => quiver.remove(), 500); }, 3500);
}

function playCallArcherAnimation() {
    if (!toggleAnimations) return;
    const c = $('call-archer-container'); if (!c) return;
    c.innerHTML = '';
    if (typeof lottie !== 'undefined') {
        callArcherAnim = lottie.loadAnimation({ container: c, renderer: 'canvas', loop: true, autoplay: true, path: 'assets/Archer.json' });
    } else {
        c.innerHTML = '<span style="font-size:100px;">🏹</span>';
    }
}

function stopCallArcherAnimation() {
    if (callArcherAnim) { callArcherAnim.destroy(); callArcherAnim = null; }
    const c = $('call-archer-container'); if (c) c.innerHTML = '';
}

// === Экраны ===
function showIdleScreen() {
    $('idle-screen').style.display = 'flex';
    $('call-screen').classList.add('hidden');
    $('outgoing-end-row').classList.add('hidden');
    $('incoming-row').classList.add('hidden');
    $('active-row').classList.add('hidden');
    $('call-timer').classList.add('hidden');
    stopCallArcherAnimation();
}

function showCallScreen(type) {
    $('idle-screen').style.display = 'none';
    $('call-screen').classList.remove('hidden');
    $('call-peer-name').textContent = theirNick;
    $('call-peer-avatar').src = getAvatarUrl(theirAvatar);

    if (type === 'outgoing') {
        $('outgoing-end-row').classList.remove('hidden');
        $('incoming-row').classList.add('hidden');
        $('active-row').classList.add('hidden');
        $('call-timer').classList.add('hidden');
        $('call-status-text').textContent = 'Вызов...';
        playCallArcherAnimation();
    } else if (type === 'incoming') {
        $('outgoing-end-row').classList.add('hidden');
        $('incoming-row').classList.remove('hidden');
        $('active-row').classList.add('hidden');
        $('call-timer').classList.add('hidden');
        $('call-status-text').textContent = 'Входящий звонок...';
        playCallArcherAnimation();
        playSound('melodi.mp3');
    } else if (type === 'active') {
        $('outgoing-end-row').classList.add('hidden');
        $('incoming-row').classList.add('hidden');
        $('active-row').classList.remove('hidden');
        $('call-timer').classList.remove('hidden');
        $('call-status-text').textContent = 'Разговор';
        playCallArcherAnimation();
    }
}

// === WebRTC ===
async function getMediaStream() {
    try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { rMsg('❌ Нет микрофона', 4000); return null; }
}

function createPC() {
    if (pc) { try { pc.close(); } catch (e) {}; pc = null; }
    pc = new RTCPeerConnection({ iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'turn:robinhoodp2p.metered.live:80?transport=tcp', username: '466624d8364bb4660ed45c7d', credential: 'mpODzmBDhwG/b+VL' },
        { urls: 'turn:robinhoodp2p.metered.live:443?transport=tcp', username: '466624d8364bb4660ed45c7d', credential: 'mpODzmBDhwG/b+VL' }
    ]});
    if (stream) stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.ontrack = e => { if (e.streams[0]) { const a = new Audio(); a.srcObject = e.streams[0]; a.play().catch(() => {}); } };
    pc.onicecandidate = e => {
        if (e.candidate && activeChannelId) P2PPong.sendMessage(activeChannelId, JSON.stringify({ webrtc: 'webrtc-ice', sdp: JSON.stringify(e.candidate) }));
    };
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') { callActive = true; startCallTimer(); showCallScreen('active'); playSound('open.mp3'); }
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') { hang(false); }
    };
    return pc;
}

function startCallTimer() {
    callStartTime = Date.now(); $('call-timer').classList.remove('hidden');
    callTimerInterval = setInterval(() => {
        const e = Math.floor((Date.now() - callStartTime) / 1000);
        $('call-timer').textContent = Math.floor(e / 60).toString().padStart(2, '0') + ':' + (e % 60).toString().padStart(2, '0');
    }, 1000);
}

function stopCallTimer() { if (callTimerInterval) clearInterval(callTimerInterval); $('call-timer').classList.add('hidden'); }

async function startCall() {
    if (callActive || !activeChannelId) { rMsg('⚠ Сначала подключись', 4000); return; }
    const s = await getMediaStream(); if (!s) { showIdleScreen(); return; }
    stream = s; createPC(); showCallScreen('outgoing');
    playSound('Welk.mp3');
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
        incomingOffer = null; callActive = true; startCallTimer(); playSound('open.mp3');
    } catch (e) { hang(true); }
}

function hang(sig = true) {
    callActive = false; stopCallTimer(); stopCallArcherAnimation();
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
        try { pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(sdp))).then(() => { callActive = true; startCallTimer(); showCallScreen('active'); playSound('open.mp3'); }).catch(() => {}); } catch (e) {}
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
function getAvatarUrl(avatarSrc) {
    if (!avatarSrc || avatarSrc === 'icons/01icon.png') return 'assets/icons/01icon.png';
    if (avatarSrc === '001') return 'assets/avatar/001ava.png';
    if (avatarSrc.startsWith('assets/')) return avatarSrc.endsWith('.png') ? avatarSrc : avatarSrc + 'ava.png';
    if (avatarSrc.includes('/')) return avatarSrc.endsWith('.png') ? avatarSrc : avatarSrc + 'ava.png';
    return 'assets/avatar/' + avatarSrc + 'ava.png';
}

function loadAvatars() {
    const list = $('avatar-list'); if (!list) return; list.innerHTML = '';
    const fragment = document.createDocumentFragment();
    avatars.forEach(src => {
        const img = document.createElement('img'); img.src = src; img.className = 'avatar-option';
        img.loading = 'lazy'; img.onerror = () => img.src = 'assets/icons/01icon.png';
        img.onclick = () => {
            const pas = $('profile-avatar-small'); if (pas) pas.src = src;
            $('robin-avatar').src = src;
            selectedAvatar = src.includes('/') ? src.split('/').pop()?.replace('ava.png', '') || 'icons/01icon.png' : src;
            try { localStorage.setItem('robinhood_avatar', src); } catch (e) {}
            const savedNick = $('nick-label')?.textContent || 'Лучник';
            P2PPong.setMyProfile(savedNick, selectedAvatar);
            closeSheets(); rMsg('🖼 Аватар обновлён');
        };
        fragment.appendChild(img);
    });
    list.appendChild(fragment);
}

// === Темы ===
function applyTheme(id) { document.documentElement.setAttribute('data-theme', id); try { localStorage.setItem('robinhood_theme', id); } catch (e) {} const tn = $('theme-name'); if (tn) tn.textContent = (themes.find(t => t.id === id) || themes[0]).name; }

function generateRandomTheme() {
    const hue = Math.floor(Math.random() * 360), sat = 40 + Math.floor(Math.random() * 50), bgLight = 5 + Math.floor(Math.random() * 15), bgDark = 2 + Math.floor(Math.random() * 8), id = 'random_' + Date.now();
    const s = `[data-theme="${id}"]{--bg-primary:hsl(${hue},${sat}%,${bgLight}%);--bg-secondary:hsl(${hue},${sat-10}%,${bgDark}%);--accent:hsl(${(hue+30)%360},${sat+10}%,50%);--accent-light:hsl(${(hue+30)%360},${sat+20}%,70%);--text:hsl(${hue},20%,85%);--text-bright:hsl(${hue},25%,92%);--text-dim:hsl(${hue},15%,60%);--border:hsl(${(hue+30)%360},${sat+10}%,50%);--btn-bg:hsla(${(hue+30)%360},${sat+10}%,50%,0.1);--btn-border:hsla(${(hue+30)%360},${sat+10}%,50%,0.3);--btn-hover:hsla(${(hue+30)%360},${sat+10}%,50%,0.25);--sheet-bg:linear-gradient(145deg,hsl(${hue},${sat}%,${bgLight}%)0%,hsl(${hue},${sat-10}%,${bgDark}%)100%);--input-bg:hsla(${hue},${sat-10}%,${bgLight+2}%,0.9);--msg-bg:hsla(${hue},${sat-5}%,${bgLight+3}%,0.85);--msg-accent:hsl(${(hue+30)%360},${sat+10}%,50%);--robin-bg:hsla(${hue},${sat}%,${bgLight+8}%,0.9);--robin-accent:hsl(${(hue+30)%360},${sat+20}%,65%);--overlay-bg:rgba(0,0,0,0.6);--call-bg:linear-gradient(180deg,hsl(${hue},${sat}%,${bgLight}%)0%,hsl(${hue},${sat-10}%,${bgDark}%)100%);--call-btn-bg:hsla(${(hue+30)%360},${sat+10}%,50%,0.1);--call-btn-border:hsla(${(hue+30)%360},${sat+10}%,50%,0.3);--input-text:hsl(${hue},20%,85%)}`;
    let el = document.getElementById('gen-theme'); if (!el) { el = document.createElement('style'); el.id = 'gen-theme'; document.head.appendChild(el); }
    el.textContent = s; document.documentElement.setAttribute('data-theme', id);
    const tn = $('theme-name'); if (tn) tn.textContent = 'Авто';
    try { localStorage.setItem('robinhood_theme', id); } catch (e) {}
}

// === Фоны ===
function applyBackground(index) {
    const vbg = document.querySelector('.video-bg');
    if (!vbg) return;
    const bg = videoBackgrounds[index];
    $('videobg-name').textContent = bg.name;
    if (bg.type === 'image') {
        vbg.pause(); vbg.removeAttribute('src'); vbg.querySelector('source')?.removeAttribute('src'); vbg.load();
        vbg.style.backgroundImage = `url('${bg.src}')`; vbg.style.backgroundSize = 'cover'; vbg.style.backgroundPosition = 'center';
        vbg.style.display = 'block'; vbg.style.opacity = '1';
    } else {
        vbg.style.backgroundImage = ''; vbg.style.backgroundSize = ''; vbg.style.backgroundPosition = '';
        vbg.querySelector('source').src = bg.src; vbg.load(); vbg.play();
        vbg.style.display = ''; vbg.style.opacity = '0.35';
    }
}

function cycleBackground() {
    currentBgIndex = (currentBgIndex + 1) % videoBackgrounds.length;
    applyBackground(currentBgIndex);
}

// === Верификация ===
function showVerifyModal(expectedCode) {
    if (verificationModalShown) return;
    verificationModalShown = true; verificationDone = false;
    window._verifyCode = expectedCode; window._verifyInput = '';
    $('verify-instruction').textContent = 'Введи 7-значный код';
    $('verify-error').style.display = 'none';
    $('verify-code-display').textContent = '_______';
    const grid = $('verify-code-grid'); grid.innerHTML = '';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:240px;margin:12px auto;';
    for (let i = 1; i <= 9; i++) { const btn = document.createElement('button'); btn.textContent = i; btn.className = 'lock-num'; btn.onclick = () => addVerifyDigit(i.toString()); grid.appendChild(btn); }
    const btn0 = document.createElement('button'); btn0.textContent = '0'; btn0.className = 'lock-num'; btn0.onclick = () => addVerifyDigit('0'); grid.appendChild(btn0);
    const btnDel = document.createElement('button'); btnDel.textContent = '⌫'; btnDel.className = 'lock-num'; btnDel.style.background = 'rgba(244,67,54,0.3)'; btnDel.onclick = () => { window._verifyInput = window._verifyInput.slice(0, -1); $('verify-code-display').textContent = window._verifyInput.padEnd(7, '_'); }; grid.appendChild(btnDel);
    $('btn-verify-reset').onclick = () => { window._verifyInput = ''; $('verify-code-display').textContent = '_______'; };
    $('verify-modal')?.classList.add('active');
}

function addVerifyDigit(d) { if (window._verifyInput.length >= 7) return; window._verifyInput += d; $('verify-code-display').textContent = window._verifyInput.padEnd(7, '_'); if (window._verifyInput.length === 7) { setTimeout(() => $('btn-verify-confirm')?.click(), 300); } }

function generateQR(text, size) {
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const bytes = new TextEncoder().encode(text);
    const moduleCount = 21; const moduleSize = Math.floor(size / (moduleCount + 8));
    const offset = Math.floor((size - moduleCount * moduleSize) / 2);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#000000';
    function drawModule(row, col) { ctx.fillRect(offset + col * moduleSize, offset + row * moduleSize, moduleSize, moduleSize); }
    function drawFinderPattern(startRow, startCol) { for (let r = 0; r < 7; r++) { for (let c = 0; c < 7; c++) { if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) { drawModule(startRow + r, startCol + c); } } } }
    drawFinderPattern(0, 0); drawFinderPattern(0, moduleCount - 7); drawFinderPattern(moduleCount - 7, 0);
    let bitIndex = 0; const totalBits = bytes.length * 8;
    for (let row = 0; row < moduleCount && bitIndex < totalBits; row++) { for (let col = 0; col < moduleCount && bitIndex < totalBits; col++) { if ((row < 7 && col < 7) || (row < 7 && col >= moduleCount - 7) || (row >= moduleCount - 7 && col < 7)) continue; const byteIndex = Math.floor(bitIndex / 8); const bitInByte = 7 - (bitIndex % 8); const bit = (bytes[byteIndex] >> bitInByte) & 1; if (bit === 1) drawModule(row, col); bitIndex++; } }
    return canvas.toDataURL('image/png');
}

function showInput(title, placeholder = '') { return new Promise((resolve) => { $('input-modal-title').textContent = title; $('input-modal-field').value = ''; $('input-modal-field').placeholder = placeholder; $('input-modal')?.classList.add('active'); const ok = () => { const val = $('input-modal-field').value.trim(); $('input-modal')?.classList.remove('active'); cleanup(); resolve(val); }; const cancel = () => { $('input-modal')?.classList.remove('active'); cleanup(); resolve(null); }; const cleanup = () => { $('input-modal-ok').removeEventListener('click', ok); $('input-modal-cancel').removeEventListener('click', cancel); $('input-modal-field').removeEventListener('keypress', onKey); }; const onKey = (e) => { if (e.key === 'Enter') ok(); }; $('input-modal-ok').addEventListener('click', ok); $('input-modal-cancel').addEventListener('click', cancel); $('input-modal-field').addEventListener('keypress', onKey); $('input-modal-field').focus(); }); }
function showConfirm(title, text) { return new Promise((resolve) => { $('confirm-modal-title').textContent = title; $('confirm-modal-text').textContent = text; $('confirm-modal')?.classList.add('active'); const yes = () => { $('confirm-modal')?.classList.remove('active'); cleanup(); resolve(true); }; const no = () => { $('confirm-modal')?.classList.remove('active'); cleanup(); resolve(false); }; const cleanup = () => { $('confirm-modal-yes').removeEventListener('click', yes); $('confirm-modal-no').removeEventListener('click', no); }; $('confirm-modal-yes').addEventListener('click', yes); $('confirm-modal-no').addEventListener('click', no); }); }

// === Инициализация ===
function initUI() {
    P2PPong.on('ready', () => { rMsg('🏹 Святые сокеты стабильны!', 0); showIdleScreen(); });
    P2PPong.on('peer-id-generated', d => {
        $('craft-peer-id-display').textContent = d.beaconId || 'Не создана';
        const code = d.code; const pubKey = d.pubKey;
        if (code) {
            const cd = $('craft-code-display'); if (cd) { cd.textContent = code; cd.style.display = 'block'; }
            const qr = $('craft-qr-code'); if (qr) { qr.innerHTML = ''; const qrDataUrl = generateQR(JSON.stringify({ beaconId: d.beaconId, code, pubKey }), 200); const img = document.createElement('img'); img.src = qrDataUrl; img.style.cssText = 'width:200px;height:200px;margin:8px auto;display:block;'; img.loading = 'lazy'; qr.appendChild(img); qr.style.display = 'block'; }
        }
        window._verifyCode = code;
        rMsg('🏹 Стрела изготовлена!', 3000);
    });
    P2PPong.on('beacon-taken', () => { rMsg('👀 Метку забрали...', 3000); });
    P2PPong.on('verification-needed', d => { showVerifyModal(d.code); });
    P2PPong.on('channel-opened', d => {
        activeChannelId = d.channelId;
        if (d.nick) theirNick = d.nick;
        if (d.avatar) theirAvatar = d.avatar;
        $('robin-bar-sender').textContent = theirNick;
        $('verify-modal')?.classList.remove('active'); verificationModalShown = false; verificationDone = false;
        setTimeout(() => { playQuiverAnimation(); }, 300);
        rMsg('✅ Колчан открыт! Тетива натянута!', 3000);
        $('craft-modal')?.classList.remove('active');
        showIdleScreen();
    });
    P2PPong.on('message-received', d => {
        if (!d.text) return;
        try {
            const p = JSON.parse(d.text);
            if (p.type === 'channel-destroyed') {
                playSmokeAnimation(); playSound('clear cache.mp3');
                rMsg('🚬 Робин Гуд скурил аудио вещание!', 5000);
                if (callActive || pc) { callActive = false; stopCallTimer(); stopCallArcherAnimation(); if (pc) { try { pc.close(); } catch (e) {}; pc = null; } if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } incomingOffer = null; }
                activeChannelId = null; showIdleScreen();
                $('robin-bar-sender').textContent = 'RobinCall';
                return;
            }
        } catch (e) {}
        if (d.text.indexOf('"webrtc"') > -1) {
            try { const p = JSON.parse(d.text); if (p.webrtc) handleWebRTCSignal(p.webrtc, p.sdp); } catch (e) {}
        }
    });
    P2PPong.on('error', d => { rMsg('❌ ' + d.message, 5000); });
    P2PPong.on('channel-expired', d => { if (d.channelId === activeChannelId) { hang(false); activeChannelId = null; showIdleScreen(); $('robin-bar-sender').textContent = 'RobinCall'; } });
    P2PPong.on('beacon-timeout', () => { $('verify-modal')?.classList.remove('active'); $('craft-modal')?.classList.remove('active'); verificationModalShown = false; verificationDone = false; rMsg('⏰ Время ожидания истекло. Попробуй снова.', 5000); });
    P2PPong.on('destroyed', () => { showIdleScreen(); });
}

function initApp() {
    const savedTheme = localStorage.getItem('robinhood_theme'); if (savedTheme) { applyTheme(savedTheme); } else { applyTheme('forest'); }
    currentBgIndex = 0; applyBackground(currentBgIndex);

    const savedAvatar = localStorage.getItem('robinhood_avatar');
    if (savedAvatar) { selectedAvatar = savedAvatar.includes('/') ? savedAvatar.split('/').pop()?.replace('ava.png', '') || 'icons/01icon.png' : savedAvatar; const pas = $('profile-avatar-small'); if (pas) pas.src = getAvatarUrl(selectedAvatar); $('robin-avatar').src = getAvatarUrl(selectedAvatar); }

    const savedNick = localStorage.getItem('robinhood_nick'); const nl = $('nick-label'); if (savedNick && nl) { myNick = savedNick.substring(0, 12); nl.textContent = myNick; }
    P2PPong.setMyProfile(savedNick || 'Лучник', selectedAvatar);

    toggleSoundState = localStorage.getItem('robinhood_sound') !== 'false'; const ts = $('toggle-sound'); if (ts) ts.checked = toggleSoundState;
    toggleAnimations = localStorage.getItem('robinhood_animations') !== 'false'; const ta = $('toggle-animations'); if (ta) ta.checked = toggleAnimations;

    let headerVisible = true;
    $('robin-bar')?.addEventListener('click', () => { const h1 = document.querySelector('.header-row-1'); const h2 = document.querySelector('.header-row-2'); const h3 = document.querySelector('.header-row-3'); if (headerVisible) { h1.style.display = 'none'; h2.style.display = 'none'; h3.style.display = 'none'; headerVisible = false; } else { h1.style.display = ''; h2.style.display = ''; h3.style.display = ''; headerVisible = true; } });

    $('btn-avatar')?.addEventListener('click', () => { closeSheets(); loadAvatars(); $('avatar-selector')?.classList.add('show'); $('overlay')?.classList.add('show'); });
    $('btn-craft')?.addEventListener('click', () => { $('craft-peer-id-display').textContent = P2PPong._beaconId || 'Не создана'; $('craft-modal')?.classList.add('active'); });
    $('btn-craft-arrow')?.addEventListener('click', () => P2PPong.craftArrow());
    $('btn-copy-peer-id')?.addEventListener('click', () => { const bid = P2PPong._beaconId; const code = P2PPong.getVerificationCode(); let copyText = bid || ''; if (code) copyText += '\n' + code; if (bid) { navigator.clipboard.writeText(copyText).then(() => rMsg('⎘ Скопировано!')).catch(() => {}); } });
    $('close-craft-modal')?.addEventListener('click', () => $('craft-modal')?.classList.remove('active'));
    $('craft-modal')?.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('active'); });
    $('btn-scan-qr')?.addEventListener('click', async () => { const text = await showInput('Вставь данные из QR', ''); if (text) { try { const qrData = JSON.parse(text); const ok = await P2PPong.joinBeacon(qrData.beaconId); if (ok) { rMsg('📷 QR принят!', 3000); $('craft-modal')?.classList.remove('active'); } } catch(e) { rMsg('❌ Неверный формат', 3000); } } });
    $('btn-create-beacon')?.addEventListener('click', async () => { const targetId = $('peer-id-input')?.value.trim(); if (targetId) { const ok = await P2PPong.joinBeacon(targetId); if (ok) { playArcherAnimation(); rMsg('🏹 Тетива натянута...', 3000); $('craft-modal')?.classList.remove('active'); } } });

    $('btn-main-action')?.addEventListener('click', () => { $('craft-peer-id-display').textContent = P2PPong._beaconId || 'Не создана'; $('craft-modal')?.classList.add('active'); });
    $('btn-main-join')?.addEventListener('click', () => { const raw = $('main-join-input')?.value.trim(); if (!raw) { rMsg('⚠ Вставь Beacon ID', 3000); return; } P2PPong.joinBeacon(raw.split('\n')[0]?.trim()); });
    $('main-join-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') $('btn-main-join')?.click(); });

    $('btn-verify-confirm')?.addEventListener('click', async () => { const inputCode = window._verifyInput || ''; const expectedCode = window._verifyCode || ''; const errEl = $('verify-error'); if (inputCode.length !== 7) { if (errEl) { errEl.textContent = 'Введи ровно 7 цифр'; errEl.style.display = 'block'; } return; } if (inputCode === expectedCode) { if (errEl) errEl.style.display = 'none'; verificationModalShown = false; verificationDone = true; $('verify-modal')?.classList.remove('active'); await P2PPong.confirmVerification(); rMsg('✅ Подтверждено!', 3000); } else { if (errEl) { errEl.textContent = '❌ Неверный код.'; errEl.style.display = 'block'; } window._verifyInput = ''; $('verify-code-display').textContent = '_______'; } });
    $('close-verify-modal')?.addEventListener('click', () => { $('verify-modal')?.classList.remove('active'); verificationModalShown = false; });
    $('verify-modal')?.addEventListener('click', function(e) { if (e.target === this) { this.classList.remove('active'); verificationModalShown = false; } });

    $('btn-clear')?.addEventListener('click', async () => {
        const confirmed = await showConfirm('Робин Гуд скурил аудио вещание!', '');
        if (!confirmed) return;
        if (activeChannelId) { try { P2PPong.sendMessage(activeChannelId, JSON.stringify({ type: 'channel-destroyed', channelId: activeChannelId })); } catch (e) {} }
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (callActive || pc) { callActive = false; stopCallTimer(); stopCallArcherAnimation(); if (pc) { try { pc.close(); } catch (e) {}; pc = null; } if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } incomingOffer = null; }
        activeChannelId = null; showIdleScreen();
        playSmokeAnimation(); playSound('clear cache.mp3');
        rMsg('🚬 Робин Гуд скурил аудио вещание!', 5000);
        localStorage.clear(); $('robin-bar-sender').textContent = 'RobinCall';
    });

    $('btn-settings')?.addEventListener('click', () => { closeSheets(); $('settings-sheet')?.classList.add('open'); $('overlay')?.classList.add('show'); });
    $('settings-close')?.addEventListener('click', closeSheets); $('overlay')?.addEventListener('click', closeSheets);

    $('nick-label')?.addEventListener('click', () => { $('nick-modal')?.classList.add('active'); $('nick-input').value = $('nick-label')?.textContent || ''; });
    $('btn-save-nick')?.addEventListener('click', () => { const n = $('nick-input')?.value.trim(); if (n) { const nl2 = $('nick-label'); if (nl2) nl2.textContent = n.substring(0, 12); try { localStorage.setItem('robinhood_nick', n.substring(0, 12)); } catch (e) {} P2PPong.setMyProfile(n.substring(0, 12), selectedAvatar); } $('nick-modal')?.classList.remove('active'); });
    $('close-nick-modal')?.addEventListener('click', () => $('nick-modal')?.classList.remove('active'));

    $('setting-theme')?.addEventListener('click', generateRandomTheme);
    $('setting-videobg')?.addEventListener('click', () => { cycleBackground(); playSound('shot.mp3'); rMsg('🎬 Фон: ' + videoBackgrounds[currentBgIndex].name, 2000); });

    if (ts) ts.addEventListener('change', function() { toggleSoundState = this.checked; try { localStorage.setItem('robinhood_sound', toggleSoundState); } catch (e) {} });
    if (ta) ta.addEventListener('change', function() { toggleAnimations = this.checked; try { localStorage.setItem('robinhood_animations', toggleAnimations); } catch (e) {} });

    // Звонки
    $('btn-cancel-call')?.addEventListener('click', () => hang(true));
    $('btn-answer')?.addEventListener('click', acceptCall);
    $('btn-reject')?.addEventListener('click', () => { if (incomingOffer) { P2PPong.sendMessage(activeChannelId, JSON.stringify({ webrtc: 'webrtc-hangup', sdp: '' })); incomingOffer = null; } showIdleScreen(); });
    $('btn-end-call')?.addEventListener('click', () => hang(true));
    $('btn-mic')?.addEventListener('click', () => { if (stream) { micOn = !micOn; stream.getAudioTracks().forEach(t => t.enabled = micOn); $('btn-mic').textContent = micOn ? '🎤' : '🔇'; } });
    $('btn-speaker')?.addEventListener('click', () => { $('btn-speaker').textContent = $('btn-speaker').textContent === '🔊' ? '🔈' : '🔊'; });

    showIdleScreen(); rMsg('🏹 Колчан готов!', 3000);
}

window.addEventListener('beforeunload', () => { if (pc) { try { pc.close(); } catch (e) {} } P2PPong.destroy(); });

P2PPong.on('ready', () => {
    initUI(); initApp();
    const loadingContainer = document.getElementById('loading-lottie');
    if (loadingContainer && typeof lottie !== 'undefined') {
        const anim = lottie.loadAnimation({ container: loadingContainer, renderer: 'svg', loop: false, autoplay: true, path: 'assets/Loading.json' });
        anim.addEventListener('complete', function() { const loadingScreen = document.getElementById('loading-screen'); if (loadingScreen) loadingScreen.style.display = 'none'; });
    } else {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.style.display = 'none';
    }
});
P2PPong.init();
