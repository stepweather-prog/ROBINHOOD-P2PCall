// robincall-ui.js
let activeChannelId = null;
let selectedAvatar = '001';
let myNick = 'Лучник';
let theirNick = 'Незнакомец';
let theirAvatar = '001';
let toggleSoundState = true;
let toggleAnimations = true;
let archerAnimation = null;
let quiverAnim = null;
let currentArrowContainer = null;

// WebRTC
let pc = null, stream = null, callActive = false, callStartTime = null, callTimerInterval = null;
let micOn = true, incomingOffer = null;
let callArcherAnim = null;

// Модалки
let verifyCode = '', verifyInput = '';
let verificationModalShown = false;

const audioPool = {};

const videoBackgrounds = [
    { type: 'image', src: 'assets/icons/background.webp', name: 'Статика' },
    { type: 'video', src: 'assets/icons/background.webm', name: 'Неон' },
    { type: 'video', src: 'assets/icons/background2.webm', name: 'Робин' },
    { type: 'video', src: 'assets/icons/background3.webm', name: 'Листва' },
];
let currentBgIndex = 0;

const themes = [
    { id: 'forest', name: 'Лес' }, { id: 'sunset', name: 'Закат' }, { id: 'ocean', name: 'Океан' },
    { id: 'rose', name: 'Роза' }, { id: 'amber', name: 'Янтарь' }, { id: 'mint', name: 'Мята' },
    { id: 'lavender', name: 'Лаванда' }, { id: 'cherry', name: 'Вишня' }, { id: 'emerald', name: 'Изумруд' },
    { id: 'slate', name: 'Сланец' }, { id: 'coral', name: 'Коралл' }, { id: 'plum', name: 'Слива' }
];

function $(s) { return document.getElementById(s); }
function rMsg(m, t = 0) {
    const rm = $('robin-text'); if (!rm) return;
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

// === Анимации ===
function playSmokeAnimation() {
    if (!toggleAnimations) return;
    const smoke = document.createElement('div'); smoke.className = 'smoke-anim';
    document.body.appendChild(smoke);
    if (typeof lottie !== 'undefined') {
        try { lottie.loadAnimation({ container: smoke, renderer: 'canvas', loop: false, autoplay: true, path: 'assets/smoke.json' }); } catch (e) {}
    }
    setTimeout(() => { if (smoke.parentNode) smoke.remove(); }, 5000);
}

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
        try {
            archerAnimation = lottie.loadAnimation({ container: wrapper, renderer: 'canvas', loop: false, autoplay: true, path: 'assets/Archer.json' });
            archerAnimation.addEventListener('complete', () => { if (wrapper.parentNode) wrapper.remove(); currentArrowContainer = null; archerAnimation = null; rt.textContent = 'Святые сокеты стабильны!'; });
        } catch (e) { wrapper.textContent = '🏹'; wrapper.style.fontSize = '40px'; setTimeout(() => { if (wrapper.parentNode) wrapper.remove(); currentArrowContainer = null; rt.textContent = 'Святые сокеты стабильны!'; }, 1500); }
    } else { wrapper.textContent = '🏹'; wrapper.style.fontSize = '40px'; setTimeout(() => { if (wrapper.parentNode) wrapper.remove(); currentArrowContainer = null; rt.textContent = 'Святые сокеты стабильны!'; }, 1500); }
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
    $('incoming-row').classList.add('hidden');
    $('active-row').classList.add('hidden');
    $('call-timer').classList.add('hidden');
    $('call-status-text').textContent = '';
    stopCallArcherAnimation();
}

function showCallScreen(type) {
    $('idle-screen').style.display = 'none';
    $('call-screen').classList.remove('hidden');
    $('call-peer-name').textContent = theirNick;
    $('call-peer-avatar').src = getAvatarUrl(theirAvatar);

    if (type === 'outgoing') {
        $('incoming-row').classList.add('hidden'); $('active-row').classList.add('hidden');
        $('call-timer').classList.add('hidden'); $('call-status-text').textContent = 'Вызов...';
        playCallArcherAnimation();
    } else if (type === 'incoming') {
        $('incoming-row').classList.remove('hidden'); $('active-row').classList.add('hidden');
        $('call-timer').classList.add('hidden'); $('call-status-text').textContent = 'Входящий звонок...';
        playCallArcherAnimation(); playSound('melodi.mp3');
    } else if (type === 'active') {
        $('incoming-row').classList.add('hidden'); $('active-row').classList.remove('hidden');
        $('call-timer').classList.remove('hidden'); $('call-status-text').textContent = 'Разговор';
        playCallArcherAnimation(); playSound('open.mp3');
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
        try { incomingOffer = JSON.parse(sdp); showCallScreen('incoming'); rMsg('📞 Входящий!', 0); playSound('melodi.mp3'); } catch (e) {}
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
const avatarList = ['002','004','006','007','023','025','028','031','033','037','045','051','053','056','057','059','062','064','066','075','076','080','082','092','094','097','098','110','112','114','119','128','129','132','146','150','153','154','156','159','161','166','167'];
const avatars = avatarList.map(id => 'assets/avatar/' + id + 'ava.png');

function getAvatarUrl(src) {
    if (!src || src === '001' || src === 'icons/01icon.png') return 'assets/icons/01icon.png';
    if (src.startsWith('assets/')) return src;
    return 'assets/avatar/' + src + 'ava.png';
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
            selectedAvatar = src.split('/').pop().replace('ava.png', '') || '001';
            localStorage.setItem('robinhood_avatar', src);
            P2PPong.setMyProfile(myNick, selectedAvatar);
            closeSheets(); rMsg('🖼 Аватар обновлён');
        };
        fragment.appendChild(img);
    });
    list.appendChild(fragment);
}

// === Темы ===
function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    localStorage.setItem('robinhood_theme', id);
    const tn = $('theme-name');
    if (tn) tn.textContent = (themes.find(t => t.id === id) || themes[0]).name;
}

function generateRandomTheme() {
    const hue = Math.floor(Math.random() * 360), sat = 40 + Math.floor(Math.random() * 50),
          bgLight = 5 + Math.floor(Math.random() * 15), bgDark = 2 + Math.floor(Math.random() * 8),
          id = 'random_' + Date.now();
    const s = `[data-theme="${id}"]{--bg-primary:hsl(${hue},${sat}%,${bgLight}%);--bg-secondary:hsl(${hue},${sat-10}%,${bgDark}%);--accent:hsl(${(hue+30)%360},${sat+10}%,50%);--accent-light:hsl(${(hue+30)%360},${sat+20}%,70%);--text:hsl(${hue},20%,85%);--text-bright:hsl(${hue},25%,92%);--text-dim:hsl(${hue},15%,60%);--border:hsl(${(hue+30)%360},${sat+10}%,50%);--btn-bg:hsla(${(hue+30)%360},${sat+10}%,50%,0.1);--btn-border:hsla(${(hue+30)%360},${sat+10}%,50%,0.3);--btn-hover:hsla(${(hue+30)%360},${sat+10}%,50%,0.25);--sheet-bg:linear-gradient(145deg,hsl(${hue},${sat}%,${bgLight}%)0%,hsl(${hue},${sat-10}%,${bgDark}%)100%);--input-bg:hsla(${hue},${sat-10}%,${bgLight+2}%,0.9);--robin-bg:hsla(${hue},${sat}%,${bgLight+8}%,0.9);--robin-accent:hsl(${(hue+30)%360},${sat+20}%,65%);--overlay-bg:rgba(0,0,0,0.6);--call-bg:linear-gradient(180deg,hsl(${hue},${sat}%,${bgLight}%)0%,hsl(${hue},${sat-10}%,${bgDark}%)100%);--call-btn-bg:hsla(${(hue+30)%360},${sat+10}%,50%,0.1);--call-btn-border:hsla(${(hue+30)%360},${sat+10}%,50%,0.3);--input-text:hsl(${hue},20%,85%);--msg-bg:hsla(${hue},${sat-5}%,${bgLight+3}%,0.85);--msg-accent:hsl(${(hue+30)%360},${sat+10}%,50%)}`;
    let el = document.getElementById('gen-theme'); if (!el) { el = document.createElement('style'); el.id = 'gen-theme'; document.head.appendChild(el); }
    el.textContent = s; document.documentElement.setAttribute('data-theme', id);
    const tn = $('theme-name'); if (tn) tn.textContent = 'Авто';
    localStorage.setItem('robinhood_theme', id);
}

// === Фоны ===
function applyBackground(index) {
    const vbg = document.querySelector('.video-bg');
    if (!vbg) return;
    const bg = videoBackgrounds[index];
    $('videobg-name').textContent = bg.name;
    if (bg.type === 'image') {
        vbg.pause(); vbg.removeAttribute('src');
        vbg.querySelector('source')?.removeAttribute('src'); vbg.load();
        vbg.style.backgroundImage = `url('${bg.src}')`;
        vbg.style.backgroundSize = 'cover'; vbg.style.backgroundPosition = 'center';
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
    verificationModalShown = true;
    verifyCode = expectedCode; verifyInput = '';
    $('verify-instruction').textContent = 'Введи 7-значный код';
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

function generateQR(text, size) {
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const bytes = new TextEncoder().encode(text);
    const moduleCount = 21; const moduleSize = Math.floor(size / (moduleCount + 8));
    const offset = Math.floor((size - moduleCount * moduleSize) / 2);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#000000';
    function drawModule(row, col) { ctx.fillRect(offset + col * moduleSize, offset + row * moduleSize, moduleSize, moduleSize); }
    function drawFinderPattern(startRow, startCol) {
        for (let r = 0; r < 7; r++) { for (let c = 0; c < 7; c++) { if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) drawModule(startRow + r, startCol + c); } }
    }
    drawFinderPattern(0, 0); drawFinderPattern(0, moduleCount - 7); drawFinderPattern(moduleCount - 7, 0);
    let bitIndex = 0; const totalBits = bytes.length * 8;
    for (let row = 0; row < moduleCount && bitIndex < totalBits; row++) {
        for (let col = 0; col < moduleCount && bitIndex < totalBits; col++) {
            if ((row < 7 && col < 7) || (row < 7 && col >= moduleCount - 7) || (row >= moduleCount - 7 && col < 7)) continue;
            const byteIndex = Math.floor(bitIndex / 8); const bitInByte = 7 - (bitIndex % 8);
            const bit = (bytes[byteIndex] >> bitInByte) & 1;
            if (bit === 1) drawModule(row, col); bitIndex++;
        }
    }
    return canvas.toDataURL('image/png');
}

// === Инициализация ===
function initUI() {
    P2PPong.on('ready', () => { rMsg('🏹 Колчан готов!', 0); showIdleScreen(); });

    P2PPong.on('peer-id-generated', d => {
        $('craft-peer-id-display').textContent = d.beaconId || 'Не создана';
        const code = d.code;
        if (code) {
            const cd = $('craft-code-display'); cd.style.display = 'block'; cd.textContent = code;
            const qr = $('craft-qr-code'); qr.innerHTML = '';
            const qrDataUrl = generateQR(JSON.stringify({ beaconId: d.beaconId, code, pubKey: d.pubKey }), 200);
            const img = document.createElement('img'); img.src = qrDataUrl; img.style.cssText = 'width:200px;height:200px;margin:8px auto;display:block;'; img.loading = 'lazy';
            qr.appendChild(img); qr.style.display = 'block';
        }
        rMsg('✅ Стрела создана!', 3000);
        navigator.clipboard.writeText(d.beaconId + '\n' + (d.code || '')).catch(() => {});
    });

    P2PPong.on('verification-needed', d => { showVerifyModal(d.code); });

    P2PPong.on('channel-opened', d => {
        activeChannelId = d.channelId;
        if (d.nick) theirNick = d.nick; if (d.avatar) theirAvatar = d.avatar;
        $('robin-bar-sender').textContent = theirNick;
        showIdleScreen();
        setTimeout(() => { playQuiverAnimation(); }, 300);
        rMsg('✅ Колчан открыт! Тетива натянута!', 3000);
        $('verify-modal')?.classList.remove('active'); $('craft-modal')?.classList.remove('active');
        verificationModalShown = false;
    });

    P2PPong.on('message-received', d => {
        if (!d.text) return;

        // Проверяем сигнал уничтожения
        try {
            const p = JSON.parse(d.text);
            if (p.type === 'channel-destroyed') {
                playSmokeAnimation();
                playSound('clear cache.mp3');
                rMsg('🚬 Робин Гуд скурил аудио вещание!', 5000);

                if (callActive || pc) {
                    callActive = false; stopCallTimer(); stopCallArcherAnimation();
                    if (pc) { try { pc.close(); } catch (e) {}; pc = null; }
                    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
                    incomingOffer = null;
                }

                activeChannelId = null;
                showIdleScreen();
                $('robin-bar-sender').textContent = 'RobinCall';
                return;
            }
        } catch (e) {}

        if (d.text.indexOf('"webrtc"') > -1) {
            try { const p = JSON.parse(d.text); if (p.webrtc) handleWebRTCSignal(p.webrtc, p.sdp); } catch (e) {}
        }
    });

    P2PPong.on('error', d => { rMsg('❌ ' + (d.message || 'Ошибка'), 5000); });
    P2PPong.on('channel-expired', d => { if (d.channelId === activeChannelId) { hang(false); activeChannelId = null; showIdleScreen(); } });
}

function initApp() {
    const savedTheme = localStorage.getItem('robinhood_theme');
    if (savedTheme) applyTheme(savedTheme); else applyTheme('slate');

    currentBgIndex = 0;
    applyBackground(currentBgIndex);

    const savedAvatar = localStorage.getItem('robinhood_avatar');
    if (savedAvatar) {
        const pas = $('profile-avatar-small'); if (pas) pas.src = getAvatarUrl(savedAvatar);
        $('robin-avatar').src = getAvatarUrl(savedAvatar);
        selectedAvatar = savedAvatar.includes('/') ? savedAvatar.split('/').pop()?.replace('ava.png', '') || '001' : savedAvatar;
    }

    const savedNick = localStorage.getItem('robinhood_nick');
    if (savedNick) { myNick = savedNick.substring(0, 12); $('nick-label').textContent = myNick; }
    P2PPong.setMyProfile(myNick, selectedAvatar);

    toggleSoundState = localStorage.getItem('robinhood_sound') !== 'false';
    $('toggle-sound').checked = toggleSoundState;
    toggleAnimations = localStorage.getItem('robinhood_animations') !== 'false';

    // Скрытие шапки по клику на робин-бар
    let headerVisible = true;
    $('robin-bar')?.addEventListener('click', () => {
        const h1 = document.querySelector('.header-row-1');
        const h2 = document.querySelector('.header-row-2');
        const h3 = document.querySelector('.header-row-3');
        if (headerVisible) { h1.style.display = 'none'; h2.style.display = 'none'; h3.style.display = 'none'; headerVisible = false; }
        else { h1.style.display = ''; h2.style.display = ''; h3.style.display = ''; headerVisible = true; }
    });

    // Кнопки шапки
    $('btn-avatar')?.addEventListener('click', () => { closeSheets(); loadAvatars(); $('avatar-selector')?.classList.add('show'); $('overlay')?.classList.add('show'); });
    $('btn-craft')?.addEventListener('click', () => { $('craft-peer-id-display').textContent = P2PPong._beaconId || 'Не создана'; $('craft-modal')?.classList.add('active'); });
    $('btn-call-main')?.addEventListener('click', () => {
        if (!activeChannelId) { rMsg('⚠ Сначала подключись', 3000); return; }
        if (callActive) { hang(true); } else { startCall(); }
    });
    $('btn-clear')?.addEventListener('click', async () => {
        const confirmed = await showConfirm('Робин Гуд скурил аудио вещание!', '');
        if (!confirmed) return;

        // Отправляем сигнал собеседнику
        if (activeChannelId) {
            try { P2PPong.sendMessage(activeChannelId, JSON.stringify({ type: 'channel-destroyed', channelId: activeChannelId })); } catch (e) {}
        }

        // Задержка чтобы собеседник успел обработать
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Чистим у себя
        if (callActive || pc) {
            callActive = false; stopCallTimer(); stopCallArcherAnimation();
            if (pc) { try { pc.close(); } catch (e) {}; pc = null; }
            if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
            incomingOffer = null;
        }

        activeChannelId = null;
        showIdleScreen();
        playSmokeAnimation();
        playSound('clear cache.mp3');
        rMsg('🚬 Робин Гуд скурил аудио вещание!', 5000);
        localStorage.clear();
        $('robin-bar-sender').textContent = 'RobinCall';
    });
    $('btn-settings')?.addEventListener('click', () => { closeSheets(); $('settings-sheet')?.classList.add('open'); $('overlay')?.classList.add('show'); });
    $('settings-close')?.addEventListener('click', closeSheets);
    $('overlay')?.addEventListener('click', closeSheets);

    // Ник
    $('nick-label')?.addEventListener('click', () => { $('nick-input').value = myNick; $('nick-modal')?.classList.add('active'); });
    $('btn-save-nick')?.addEventListener('click', () => {
        const n = $('nick-input').value.trim().substring(0, 12);
        if (n) { myNick = n; $('nick-label').textContent = n; localStorage.setItem('robinhood_nick', n); P2PPong.setMyProfile(n, selectedAvatar); }
        $('nick-modal')?.classList.remove('active');
    });
    $('close-nick-modal')?.addEventListener('click', () => $('nick-modal')?.classList.remove('active'));

    // Главная кнопка — открыть колчан
    $('btn-main-action')?.addEventListener('click', () => {
        $('craft-peer-id-display').textContent = P2PPong._beaconId || 'Не создана';
        $('craft-modal')?.classList.add('active');
    });

    // Крафт
    $('btn-craft-arrow')?.addEventListener('click', () => P2PPong.craftArrow());
    $('btn-scan-qr')?.addEventListener('click', async () => {
        const text = await showInput('Вставь данные из QR', '');
        if (text) {
            try { const qrData = JSON.parse(text); const ok = await P2PPong.joinBeacon(qrData.beaconId); if (ok) { rMsg('📷 QR принят!', 3000); $('craft-modal')?.classList.remove('active'); } }
            catch(e) { rMsg('❌ Неверный формат', 3000); }
        }
    });
    $('btn-copy-peer-id')?.addEventListener('click', () => {
        const bid = P2PPong._beaconId; const code = $('craft-code-display')?.textContent;
        let copyText = bid || ''; if (code) copyText += '\n' + code;
        if (bid) navigator.clipboard.writeText(copyText).then(() => rMsg('📋 Скопировано!', 2000));
    });
    $('btn-create-beacon')?.addEventListener('click', async () => {
        const targetId = $('peer-id-input')?.value.trim();
        if (targetId) { const ok = await P2PPong.joinBeacon(targetId); if (ok) { playArcherAnimation(); rMsg('🏹 Тетива натянута...', 3000); $('craft-modal')?.classList.remove('active'); } }
    });
    $('close-craft-modal')?.addEventListener('click', () => $('craft-modal')?.classList.remove('active'));

    // Поле ввода на главном экране
    $('btn-main-join')?.addEventListener('click', () => {
        const raw = $('main-join-input')?.value.trim(); if (!raw) { rMsg('⚠ Вставь Beacon ID', 3000); return; }
        P2PPong.joinBeacon(raw.split('\n')[0]?.trim());
    });
    $('main-join-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') $('btn-main-join')?.click(); });

    // Вызов
    $('btn-answer')?.addEventListener('click', acceptCall);
    $('btn-reject')?.addEventListener('click', () => {
        if (incomingOffer) { P2PPong.sendMessage(activeChannelId, JSON.stringify({ webrtc: 'webrtc-hangup', sdp: '' })); incomingOffer = null; }
        showIdleScreen(); stopCallArcherAnimation();
    });
    $('btn-end-call')?.addEventListener('click', () => hang(true));
    $('btn-mic')?.addEventListener('click', () => {
        if (stream) { micOn = !micOn; stream.getAudioTracks().forEach(t => t.enabled = micOn); $('btn-mic').textContent = micOn ? '🎤' : '🔇'; $('btn-mic').classList.toggle('muted', !micOn); }
    });
    $('btn-speaker')?.addEventListener('click', () => { $('btn-speaker').textContent = $('btn-speaker').textContent === '🔊' ? '🔈' : '🔊'; });

    // Верификация
    $('btn-verify-confirm')?.addEventListener('click', () => {
        if (verifyInput.length !== 7) { $('verify-error').style.display = 'block'; $('verify-error').textContent = 'Введи ровно 7 цифр'; return; }
        if (verifyInput === verifyCode) { $('verify-error').style.display = 'none'; verificationModalShown = false; $('verify-modal')?.classList.remove('active'); P2PPong.confirmVerification(); }
        else { $('verify-error').style.display = 'block'; $('verify-error').textContent = '❌ Неверный код'; verifyInput = ''; $('verify-code-display').textContent = '_______'; }
    });
    $('btn-verify-reset')?.addEventListener('click', () => { verifyInput = ''; $('verify-code-display').textContent = '_______'; });
    $('close-verify-modal')?.addEventListener('click', () => { $('verify-modal')?.classList.remove('active'); verificationModalShown = false; });

    // Настройки
    $('setting-videobg')?.addEventListener('click', () => { cycleBackground(); playSound('shot.mp3'); rMsg('🎬 Фон: ' + videoBackgrounds[currentBgIndex].name, 2000); });
    $('setting-theme')?.addEventListener('click', generateRandomTheme);
    $('toggle-sound')?.addEventListener('change', function () { toggleSoundState = this.checked; localStorage.setItem('robinhood_sound', toggleSoundState); });

    showIdleScreen(); rMsg('🏹 Колчан готов!', 3000);
}

// === Модалки ===
function showInput(title, placeholder = '') {
    return new Promise((resolve) => {
        $('input-modal-title').textContent = title; $('input-modal-field').value = ''; $('input-modal-field').placeholder = placeholder;
        $('input-modal')?.classList.add('active');
        const ok = () => { const val = $('input-modal-field').value.trim(); $('input-modal')?.classList.remove('active'); cleanup(); resolve(val); };
        const cancel = () => { $('input-modal')?.classList.remove('active'); cleanup(); resolve(null); };
        const cleanup = () => { $('input-modal-ok').removeEventListener('click', ok); $('input-modal-cancel').removeEventListener('click', cancel); $('input-modal-field').removeEventListener('keypress', onKey); };
        const onKey = (e) => { if (e.key === 'Enter') ok(); };
        $('input-modal-ok').addEventListener('click', ok); $('input-modal-cancel').addEventListener('click', cancel);
        $('input-modal-field').addEventListener('keypress', onKey); $('input-modal-field').focus();
    });
}

function showConfirm(title, text) {
    return new Promise((resolve) => {
        $('confirm-modal-title').textContent = title; $('confirm-modal-text').textContent = text;
        $('confirm-modal')?.classList.add('active');
        const yes = () => { $('confirm-modal')?.classList.remove('active'); cleanup(); resolve(true); };
        const no = () => { $('confirm-modal')?.classList.remove('active'); cleanup(); resolve(false); };
        const cleanup = () => { $('confirm-modal-yes').removeEventListener('click', yes); $('confirm-modal-no').removeEventListener('click', no); };
        $('confirm-modal-yes').addEventListener('click', yes); $('confirm-modal-no').addEventListener('click', no);
    });
}

P2PPong.on('ready', () => { initUI(); initApp(); });
P2PPong.init();
