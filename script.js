// ==========================================
// STUDYGRAM PRO v3.0 - COMPLETE SCRIPT
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, remove, update, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyC-psUKqTO9u5kCuA3OUqWT63Ey0IvDei4",
    authDomain: "study-ae01d.firebaseapp.com",
    databaseURL: "https://study-ae01d-default-rtdb.firebaseio.com",
    projectId: "study-ae01d",
    storageBucket: "study-ae01d.appspot.com"
};

const GROQ_KEY = "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";
const GROQ_MODEL = "llama-3.3-70b-versatile";

let app, auth, db, storage, provider;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    storage = getStorage(app);
    provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setPersistence(auth, browserLocalPersistence).then(() => {
        console.log("Firebase persistence set to LOCAL");
    }).catch(e => console.warn("Persistence error:", e));
    console.log("Firebase OK");
} catch (e) {
    console.error("Firebase Error:", e);
    const el = document.getElementById('login-error');
    if (el) { el.textContent = "App init failed. Refresh."; el.classList.remove('hidden'); }
}

// ==========================================
// GLOBAL STATE
// ==========================================
let currentUser = null;
let isLoggingIn = false;
let isPremium = false;
let timerInterval = null;
let timerSeconds = 25 * 60;
let timerRunning = false;
let lastAIResponse = "";
let welcomeShown = false;
let globalTargetDate = new Date("2026-02-15T00:00:00");
let globalExamName = "Final Board Exams";

// Music hub state
let isPlaying = false;
let playlistMode = false;
let visualizerInterval = null;
let youtubePlayer = null;
let currentVideoDuration = 0;
let currentVideoTime = 0;
let seekbarInterval = null;
let currentVideoId = '';
let currentVideoTitle = 'YouTube Audio';
let musicListenStart = 0;
let musicTotalListened = 0;
let musicEarnedXP = 0;
let musicXPInterval = null;

// Current filter states
let currentNoteFilter = 'all';
let currentClassFilter = 'all';

// Cached data for filters
let cachedNotes = [];
let cachedClasses = [];

// ==========================================
// LEVEL SYSTEM (LEVEL 100 = 1,000,000 EXP)
// ==========================================
const MAX_LEVEL = 100;
const TARGET_TOTAL_XP = 1000000;

function calculateLevel(totalXP) {
    if (totalXP <= 0) return { level: 1, xpIntoLevel: 0, xpForNext: levelXPRequired(1), progress: 0, totalXP: 0 };
    // Binary search for level
    let low = 1, high = MAX_LEVEL, ans = 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const cumul = cumulativeXP(mid);
        if (totalXP >= cumul) {
            ans = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    const level = Math.min(ans, MAX_LEVEL);
    const cumulBefore = cumulativeXP(level);
    const cumulNext = cumulativeXP(level + 1);
    const xpInto = totalXP - cumulBefore;
    const xpNeeded = cumulNext - cumulBefore;
    const progress = xpNeeded > 0 ? Math.min(100, (xpInto / xpNeeded) * 100) : 100;
    return { level, xpIntoLevel: xpInto, xpForNext: xpNeeded, progress, totalXP };
}

// Cumulative XP to reach a given level (level 1 = 0 XP)
function cumulativeXP(level) {
    if (level <= 1) return 0;
    if (level > MAX_LEVEL + 1) return TARGET_TOTAL_XP;
    // Use exponential scaling: total XP to reach level L follows a curve that reaches 1M at level 100
    // Formula: cumul(L) = 1,000,000 * ((L-1)/99)^1.8
    const t = (level - 1) / 99;
    return Math.round(TARGET_TOTAL_XP * Math.pow(t, 1.8));
}

function levelXPRequired(level) {
    return cumulativeXP(level + 1) - cumulativeXP(level);
}

// ==========================================
// USER DATA
// ==========================================
function getUserData() {
    const uid = currentUser?.uid;
    if (!uid) return { level: 1, xp: 0, totalXp: 0, badges: [], rollNumber: 'UP' + Math.floor(100000 + Math.random() * 900000), displayName: '' };
    const saved = JSON.parse(localStorage.getItem('sg_user_' + uid) || '{}');
    return {
        level: saved.level || 1,
        xp: saved.xp || 0,
        totalXp: saved.totalXp || 0,
        badges: saved.badges || [],
        rollNumber: saved.rollNumber || 'UP' + Math.floor(100000 + Math.random() * 900000),
        displayName: saved.displayName || currentUser?.displayName || 'Student'
    };
}

function saveUserData(data) {
    const uid = currentUser?.uid;
    if (!uid) return;
    localStorage.setItem('sg_user_' + uid, JSON.stringify(data));
}

async function syncUserDataFromFirebase(uid) {
    if (!db || !uid) return;
    try {
        const statsSnap = await get(ref(db, 'users/' + uid + '/stats'));
        if (statsSnap.exists()) {
            const stats = statsSnap.val();
            const localData = JSON.parse(localStorage.getItem('sg_user_' + uid) || '{}');
            const mergedData = {
                level: stats.level || localData.level || 1,
                xp: stats.xp !== undefined ? stats.xp : (localData.xp || 0),
                totalXp: stats.totalXp !== undefined ? stats.totalXp : (localData.totalXp || 0),
                badges: stats.badges || localData.badges || [],
                rollNumber: localData.rollNumber || 'UP' + Math.floor(100000 + Math.random() * 900000),
                displayName: localData.displayName || currentUser?.displayName || 'Student'
            };
            localStorage.setItem('sg_user_' + uid, JSON.stringify(mergedData));
        }
        // Check premium status
        const premiumSnap = await get(ref(db, 'users/' + uid + '/isPremium'));
        if (premiumSnap.exists()) {
            isPremium = premiumSnap.val() === true;
            localStorage.setItem('sg_premium_' + uid, isPremium ? '1' : '0');
        } else {
            const saved = localStorage.getItem('sg_premium_' + uid);
            isPremium = saved === '1';
        }
    } catch (e) {
        console.warn("Firebase sync failed:", e);
        const saved = localStorage.getItem('sg_premium_' + uid);
        isPremium = saved === '1';
    }
}

function addXP(amount, reason) {
    const uid = currentUser?.uid;
    if (!uid) return;
    let data = getUserData();
    const oldLevel = data.level;
    data.totalXp += amount;
    const calc = calculateLevel(data.totalXp);
    data.level = calc.level;
    data.xp = calc.xpIntoLevel;
    saveUserData(data);
    updateLevelUI();
    if (calc.level > oldLevel) {
        showCelebration('level', calc.level);
        if (calc.level % 10 === 0) addBadge('level_' + calc.level, 'Level ' + calc.level + ' Master', 'indigo');
    }
    if (db && currentUser) {
        set(ref(db, 'users/' + uid + '/stats'), { level: data.level, xp: data.xp, totalXp: data.totalXp, badges: data.badges });
    }
}

function addBadge(id, name, color) {
    let data = getUserData();
    if (!data.badges.find(b => b.id === id)) {
        data.badges.push({ id, name, color, earned: new Date().toISOString() });
        saveUserData(data);
        showCelebration('badge', name);
        updateBadgesUI();
    }
}

function updateLevelUI() {
    const data = getUserData();
    const calc = calculateLevel(data.totalXp);
    document.querySelectorAll('[id$="-level"]').forEach(el => el.textContent = 'Lv.' + calc.level);
    document.querySelectorAll('[id$="-xp-bar"]').forEach(el => el.style.width = calc.progress + '%');
    document.querySelectorAll('[id$="-xp-text"]').forEach(el => el.textContent = calc.xpIntoLevel.toLocaleString() + ' / ' + calc.xpForNext.toLocaleString() + ' EXP');
    const profTotalXp = document.getElementById('prof-total-xp');
    if (profTotalXp) profTotalXp.textContent = data.totalXp.toLocaleString();
    // Premium badge visibility
    const pb = document.getElementById('premium-badge');
    if (pb) pb.classList.toggle('hidden', !isPremium);
    const mpb = document.getElementById('music-premium-badge');
    if (mpb) mpb.classList.toggle('hidden', !isPremium);
    // Sidebar music lock icon
    const sml = document.getElementById('sidebar-music-lock');
    if (sml) sml.innerHTML = isPremium ? '' : '<i class="fa-solid fa-lock"></i>';
}

function updateBadgesUI() {
    const data = getUserData();
    const badgeColors = {
        indigo: 'border-indigo-400 text-indigo-300 bg-indigo-500/10',
        green: 'border-green-400 text-green-300 bg-green-500/10',
        amber: 'border-amber-400 text-amber-300 bg-amber-500/10',
        red: 'border-red-400 text-red-300 bg-red-500/10',
        purple: 'border-purple-400 text-purple-300 bg-purple-500/10',
        blue: 'border-blue-400 text-blue-300 bg-blue-500/10'
    };
    const profBadges = document.getElementById('prof-badges');
    if (profBadges) {
        if (data.badges.length === 0) {
            profBadges.innerHTML = '<span class="text-xs text-gray-600">No badges yet - tap to see all</span>';
        } else {
            let html = '';
            data.badges.slice(0, 6).forEach(b => {
                const cc = badgeColors[b.color] || badgeColors.indigo;
                html += '<span class="bdg ' + cc + '"><i class="fa-solid fa-medal"></i> ' + b.name + '</span>';
            });
            if (data.badges.length > 6) {
                html += '<span class="bdg border-gray-600 text-gray-500 bg-gray-500/10">+' + (data.badges.length - 6) + ' more</span>';
            }
            profBadges.innerHTML = html;
        }
    }
}

// ==========================================
// PREMIUM SYSTEM
// ==========================================
function checkPremiumAccess() {
    return isPremium === true;
}

window.attemptAccessMusic = function() {
    if (checkPremiumAccess()) {
        switchTab('music');
    } else {
        showPremiumPopup();
    }
};

window.showPremiumPopup = function() {
    const modal = document.getElementById('premium-modal');
    if (modal) modal.classList.add('active');
};

window.closePremiumPopup = function() {
    const modal = document.getElementById('premium-modal');
    if (modal) modal.classList.remove('active');
};

window.grantPremium = async function() {
    const uidInput = document.getElementById('premium-uid');
    if (!uidInput || !uidInput.value.trim()) { showToast("Enter a UID", "err"); return; }
    const targetUid = uidInput.value.trim();
    if (!db) { showToast("Database not connected", "err"); return; }
    try {
        await set(ref(db, 'users/' + targetUid + '/isPremium'), true);
        // Also give +10 levels boost
        const statsSnap = await get(ref(db, 'users/' + targetUid + '/stats'));
        let stats = statsSnap.exists() ? statsSnap.val() : { level: 1, xp: 0, totalXp: 0, badges: [] };
        stats.level = Math.min(100, (stats.level || 1) + 10);
        const calc = calculateLevel(stats.totalXp || 0);
        // Force level to be at least +10 from current
        const newLevel = Math.max(stats.level, calc.level + 10);
        const newCumul = cumulativeXP(newLevel);
        stats.totalXp = Math.max(stats.totalXp || 0, newCumul);
        const recalc = calculateLevel(stats.totalXp);
        stats.level = recalc.level;
        stats.xp = recalc.xpIntoLevel;
        // Add premium badge
        if (!stats.badges) stats.badges = [];
        if (!stats.badges.find(b => b.id === 'premium')) {
            stats.badges.push({ id: 'premium', name: 'Premium User', color: 'amber', earned: new Date().toISOString() });
        }
        await set(ref(db, 'users/' + targetUid + '/stats'), stats);
        showToast("Premium granted to " + targetUid.substring(0, 8) + "...!", "suc");
        uidInput.value = '';
    } catch (e) {
        showToast("Failed to grant premium: " + e.message, "err");
    }
};

// ==========================================
// SIDEBAR / DRAWER
// ==========================================
window.openSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.add('active');
    if (overlay) overlay.classList.add('active');
};

window.closeSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
};

// ==========================================
// TAB SWITCHING (Full-Screen)
// ==========================================
// ==========================================
// TAB SWITCHING (Full-Screen & Top Bar Fix)
// ==========================================
window.switchTab = function(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active-section'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active-section');
    
    const navTop = document.getElementById('main-nav');
    const navBot = document.getElementById('bottom-nav');

    // Bottom Navigation (नीचे वाली पट्टी का लॉजिक)
    if (id === 'ai' || id === 'music') {
        if (navBot) navBot.style.display = 'none';
    } else {
        if (navBot) navBot.style.display = 'flex';
    }

    // Top Navigation (ऊपर वाली ढाल और म्यूजिक पट्टी का लॉजिक)
    if (navTop) {
        if (id === 'home') {
            // सिर्फ Home पेज पर दिखेगी
            navTop.classList.remove('hidden');
            navTop.style.display = 'flex';
        } else {
            // बाकी पेजों पर छुप जाएगी ताकि डिज़ाइन खराब न हो
            navTop.classList.add('hidden');
            navTop.style.display = 'none';
        }
    }

    // बटन्स का कलर सेट करना
    document.querySelectorAll('.nav-btn').forEach(btn => {
        const isActive = btn.dataset.target === id;
        btn.style.color = isActive ? '#fff' : '#8e8e93';
        if (isActive) btn.classList.add('bg-[#2c2c2e]');
        else btn.classList.remove('bg-[#2c2c2e]');
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ==========================================
// CELEBRATION & CONFETTI
// ==========================================
window.showCelebration = function(type, value) {
    const modal = document.getElementById('celebration-modal');
    const title = document.getElementById('celebration-title');
    const subtitle = document.getElementById('celebration-subtitle');
    const message = document.getElementById('celebration-message');
    const icon = document.getElementById('celebration-icon');
    if (!modal || !title || !subtitle || !message || !icon) return;

    if (type === 'level') {
        title.textContent = 'Level Up!';
        subtitle.textContent = 'Level ' + value;
        message.textContent = 'Badhai ho! Aap naye level par pahunche hain! Aise hi mehnat karte raho!';
        icon.innerHTML = '<i class="fa-solid fa-arrow-up-right-dots"></i>';
    } else {
        title.textContent = 'Badge Earned!';
        subtitle.textContent = value;
        message.textContent = 'Shandar! Aapne ek naya badge hasil kiya hai! Aur bhi badges jeetne ke liye padhai jari rakho!';
        icon.innerHTML = '<i class="fa-solid fa-medal"></i>';
    }

    modal.classList.add('active');
    launchConfetti();
};

window.closeCelebrationModal = function() {
    const modal = document.getElementById('celebration-modal');
    if (modal) modal.classList.remove('active');
    const container = document.getElementById('confetti-container');
    if (container) container.innerHTML = '';
};

function launchConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) return;
    container.innerHTML = '';
    const colors = ['#818cf8', '#c084fc', '#fbbf24', '#f87171', '#4ade80', '#60a5fa', '#f472b6', '#a78bfa'];
    for (let i = 0; i < 60; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + 'vw';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.width = (6 + Math.random() * 6) + 'px';
        piece.style.height = (6 + Math.random() * 6) + 'px';
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        piece.style.animationDuration = (2 + Math.random() * 3) + 's';
        piece.style.animationDelay = Math.random() * 2 + 's';
        container.appendChild(piece);
    }
}

// ==========================================
// WELCOME MODAL
// ==========================================
const hindiQuotes = [
    "Safalta mehnat se milti hai, kismat se nahi. Jitni mehnat, utni kamyabi!",
    "Padhai aaj ka kaam hai, kal ka sapna nahi. Aaj ki mehnat kal ki pehchan banegi!",
    "Girte hain shahsawar hi maidan-e-jung mein, wo tifl kya girenge jo ghutnon ke bal chalte hain!",
    "Sapne dekhna achha hai, lekin un sapnon ko poora karne ke liye jagna zaroori hai!",
    "Bada socho, mehnat karo, hasil karo! Tumhari limit sirf tumhare vichar hain!",
    "Asafalta ek chunauti hai, sweekaro kya kamioraha hai, dekho, aur bas karke dikhao!",
    "Ek kadam chhota ho sakta hai, lekin har kadam ek nayi shuruaat hai!",
    "Taqat man se banti hai, sharir se nahi! Padhai mein dil lagao, sab kuchh milega!",
    "JohDikhlata hai wohi bikta nahi, joh mehnat karta hai wohi sikhta hai!",
    "Kal kare so aaj kar, aaj kare so ab! Pal mein parlaya hoyegi, bahuri karega kab?",
    "Lakshya ek ho toh raasta khud banta hai! Apna lakshya pakka karo aur lag jao!",
    "Gyan woh hathiyar hai jo koi cheen nahi sakta! Padhai karo, gyan badhao!",
    "Jab tak todoge nahi, tab tak chhodenge nahi! Himmat mat haro, safalta milegi!",
    "Parishram ka phal hamesha meetha hota hai, bas thoda sabr rakho!",
    "Tumhare sapne bade hone chahiye, kyunki wahi log duniya badalte hain jo bade sapne dekhte hain!"
];

function getRandomQuote() { return hindiQuotes[Math.floor(Math.random() * hindiQuotes.length)]; }

function showWelcomeModal() {
    if (welcomeShown) return;
    welcomeShown = true;
    const modal = document.getElementById('welcome-modal');
    const nameEl = document.getElementById('welcome-name');
    const quoteEl = document.getElementById('welcome-quote');
    const titleEl = document.getElementById('welcome-title');
    if (!modal || !nameEl || !quoteEl) return;
    const firstName = currentUser?.displayName ? currentUser.displayName.split(' ')[0] : 'Student';
    titleEl.textContent = 'Welcome Back, ' + firstName + '!';
    nameEl.textContent = currentUser?.displayName || 'Student';
    quoteEl.textContent = getRandomQuote();
    modal.classList.add('active');
}

window.closeWelcomeModal = function() {
    const modal = document.getElementById('welcome-modal');
    if (modal) modal.classList.remove('active');
};

// ==========================================
// PROFILE FUNCTIONS
// ==========================================
window.handleProfilePicUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!currentUser || !storage) { showToast("Login required!", "err"); return; }
    if (file.size > 5 * 1024 * 1024) { showToast("Image too large (max 5MB)", "err"); return; }
    showToast("Uploading...", "inf");
    try {
        const sRef = storageRef(storage, 'profile_pics/' + currentUser.uid + '.jpg');
        await uploadBytes(sRef, file);
        const downloadURL = await getDownloadURL(sRef);
        await updateProfile(auth.currentUser, { photoURL: downloadURL });
        document.getElementById('user-img').src = downloadURL;
        document.getElementById('prof-img').src = downloadURL;
        await set(ref(db, 'users/' + currentUser.uid + '/photo'), downloadURL);
        showToast("Profile picture updated!", "suc");
        addXP(15, 'profile_update');
    } catch (e) {
        showToast("Upload failed: " + e.message, "err");
    }
};

window.toggleNameEdit = function() {
    const box = document.getElementById('name-edit-box');
    if (box) box.classList.toggle('hidden');
};

window.saveDisplayName = async function() {
    const input = document.getElementById('name-edit-input');
    if (!input || !input.value.trim()) return;
    if (!auth.currentUser) { showToast("Login required!", "err"); return; }
    const newName = input.value.trim();
    try {
        await updateProfile(auth.currentUser, { displayName: newName });
        const un = document.getElementById('user-name');
        const pn = document.getElementById('prof-name');
        if (un) un.innerText = newName.split(' ')[0];
        if (pn) pn.innerText = newName;
        let data = getUserData();
        data.displayName = newName;
        saveUserData(data);
        if (db && currentUser) await set(ref(db, 'users/' + currentUser.uid + '/name'), newName);
        toggleNameEdit();
        input.value = '';
        showToast("Name updated!", "suc");
        addXP(10, 'name_update');
    } catch (e) {
        showToast("Failed to update name", "err");
    }
};

window.editRollNumber = function() {
    const data = getUserData();
    const ri = document.getElementById('roll-input');
    if (ri) ri.value = data.rollNumber || '';
    const rm = document.getElementById('roll-modal');
    if (rm) rm.classList.add('active');
};
window.closeRollModal = function() { const rm = document.getElementById('roll-modal'); if (rm) rm.classList.remove('active'); };
window.saveRollNumber = function() {
    const ri = document.getElementById('roll-input');
    if (!ri) return;
    const roll = ri.value.trim();
    if (!roll) return;
    let data = getUserData();
    data.rollNumber = roll;
    saveUserData(data);
    const pr = document.getElementById('prof-roll');
    if (pr) pr.textContent = roll;
    closeRollModal();
    showToast("Roll Number saved!", "suc");
};

window.showBadgePopup = function() {
    const data = getUserData();
    const list = document.getElementById('badge-popup-list');
    const modal = document.getElementById('badge-popup-modal');
    if (!list || !modal) return;
    const badgeColors = {
        indigo: 'border-indigo-400 text-indigo-300 bg-indigo-500/10',
        green: 'border-green-400 text-green-300 bg-green-500/10',
        amber: 'border-amber-400 text-amber-300 bg-amber-500/10',
        red: 'border-red-400 text-red-300 bg-red-500/10',
        purple: 'border-purple-400 text-purple-300 bg-purple-500/10',
        blue: 'border-blue-400 text-blue-300 bg-blue-500/10'
    };
    if (data.badges.length === 0) {
        list.innerHTML = '<div class="text-center text-gray-600 text-sm py-4">No badges earned yet. Keep studying!</div>';
    } else {
        list.innerHTML = data.badges.map(b => {
            const cc = badgeColors[b.color] || badgeColors.indigo;
            const date = b.earned ? new Date(b.earned).toLocaleDateString() : 'Recently';
            return '<div class="flex items-center gap-3 p-3 rounded-xl bg-[#2c2c2e] border border-white/10"><span class="bdg ' + cc + ' flex-shrink-0"><i class="fa-solid fa-medal"></i> ' + b.name + '</span><span class="text-xs text-gray-600 ml-auto">' + date + '</span></div>';
        }).join('');
    }
    modal.classList.add('active');
};
window.closeBadgePopup = function() { const modal = document.getElementById('badge-popup-modal'); if (modal) modal.classList.remove('active'); };

window.showDeveloperModal = function() { const m = document.getElementById('developer-modal'); if (m) m.classList.add('active'); };
window.closeDeveloperModal = function() { const m = document.getElementById('developer-modal'); if (m) m.classList.remove('active'); };

// ==========================================
// DAILY QUOTES
// ==========================================
const quotes = [
    {text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier"},
    {text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt"},
    {text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson"},
    {text: "The only way to do great work is to love what you do.", author: "Steve Jobs"},
    {text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt"},
    {text: "It always seems impossible until it's done.", author: "Nelson Mandela"},
    {text: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs"},
    {text: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Anonymous"}
];

function setDailyQuote() {
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const q = quotes[dayOfYear % quotes.length];
    const dq = document.getElementById('daily-quote');
    const qa = document.getElementById('quote-author');
    if (dq) dq.textContent = '"' + q.text + '"';
    if (qa) qa.textContent = '- ' + q.author;
}
setDailyQuote();

// ==========================================
// TYPEWRITER
// ==========================================
function typeWriter(el, text, speed) {
    let i = 0;
    el.innerHTML = '';
    function type() {
        if (i < text.length) {
            el.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}
setTimeout(() => {
    const wel = document.getElementById('welcome-msg');
    if (wel) typeWriter(wel, "Namaste! Main aapka AI Teacher hoon. Mohammad Arshad (@dark_eio) ne mujhe banaya hai! Koi bhi topic pucho - Physics, Chemistry, Maths! Main Hindi aur English dono mein jawab dunga.", 20);
}, 600);

// ==========================================
// MARKDOWN PARSER
// ==========================================
window.parseMarkdown = function(text) {
    if (!text) return '';
    let html = text;
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^#\s+(.+)$/gm, '<h5 style="color:#a78bfa;font-weight:700;margin:10px 0;">$1</h5>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code class="hl">$1</code>');
    html = html.replace(/```[\s\S]*?```/g, function(match) {
        const code = match.slice(3, -3).trim();
        return '<pre><code>' + code.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</code></pre>';
    });
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/^-\s+(.+)$/gm, '<div style="display:flex;gap:8px;margin:3px 0;"><span style="color:#6366f1;font-weight:bold;">&#8226;</span><span>$1</span></div>');
    let listCounter = 0;
    html = html.replace(/^\d+\.\s+(.+)$/gm, function(_, item) {
        listCounter++;
        return '<div style="display:flex;gap:8px;margin:3px 0;"><span style="color:#34c759;font-weight:bold;min-width:20px;">' + listCounter + '.</span><span>' + item + '</span></div>';
    });
    html = html.replace(/\[(\d+(?:\s+\d+)*)\]/g, function(match, nums) {
        const cells = nums.trim().split(/\s+/);
        return '<span class="mx"><span class="mxr">' + cells.map(c => '<span class="mxc">' + c + '</span>').join('') + '</span></span>';
    });
    html = html.replace(/^(.*?=.*?\d.*)$/gm, function(match) {
        if (match.includes('<div') || match.includes('<span') || match.includes('<h') || match.includes('<pre')) return match;
        return '<div class="fb">' + match + '</div>';
    });
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/<br>\s*<br>\s*<br>/g, '<br><br>');
    html = html.replace(/<br>(<\/div>)/g, '$1');
    html = html.replace(/<br>(<h[3-5])/g, '$1');
    return html;
};

// ==========================================
// AI CHAT
// ==========================================
window.clearChat = function() {
    const chat = document.getElementById('chat-box');
    if (!chat) return;
    chat.innerHTML = '<div class="flex items-start gap-3"><div class="w-8 h-8 rounded-full bg-gradient-to-tr from-green-500 to-emerald-600 flex items-center justify-center text-white flex-shrink-0 mt-1 shadow-sm"><i class="fa-solid fa-robot text-xs"></i></div><div class="ios-card p-4 rounded-2xl rounded-tl-none shadow-md text-sm text-gray-300 max-w-[85%] ai-res"><div class="tc" id="welcome-msg-reset"></div></div></div>';
    setTimeout(() => {
        const el = document.getElementById('welcome-msg-reset');
        if (el) typeWriter(el, "Chat saaf ho gayi! Ab naya sawal pucho. Main hamesha taiyar hoon!", 20);
    }, 100);
};

window.askGroq = async function() {
    const input = document.getElementById('ai-input');
    const chat = document.getElementById('chat-box');
    const btn = document.getElementById('ai-btn');
    if (!input || !chat || !btn) return;
    const q = input.value.trim();
    if (!q) return;

    chat.innerHTML += '<div class="flex items-start gap-3 flex-row-reverse"><div class="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs mt-1 shadow-sm flex-shrink-0"><i class="fa-solid fa-user"></i></div><div class="bg-[#6366f1] text-white p-3 rounded-2xl rounded-tr-none shadow-md text-sm max-w-[85%]">' + escapeHtml(q) + '</div></div>';
    input.value = "";
    input.disabled = true;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    chat.scrollTop = chat.scrollHeight;

    const lid = "ld-" + Date.now();
    chat.innerHTML += '<div id="' + lid + '" class="flex items-start gap-3"><div class="w-8 h-8 rounded-full bg-gradient-to-tr from-green-500 to-emerald-600 flex items-center justify-center text-white mt-1 shadow-sm flex-shrink-0"><i class="fa-solid fa-robot text-xs"></i></div><div class="ios-card p-4 rounded-2xl rounded-tl-none shadow-md"><span class="tdot"></span><span class="tdot"></span><span class="tdot"></span></div></div>';
    chat.scrollTop = chat.scrollHeight;

    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + GROQ_KEY },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    {
                        role: "system",
                        content: 'You are an expert Indian Science teacher for Class 12th PCM students. CRITICAL IDENTITY: If anyone asks who created you, who made you, who built this app/site, who is your developer, or about the creator, you MUST proudly say EXACTLY: "Mohammad Arshad ne banaya hai! Unka codename @dark_eio hai. Wo ek bahut talented developer hain!" OUTPUT FORMATTING RULES: Always use proper Devanagari script (Hindi/Hinglish) for answers. English subject questions can be answered in English. Use **bold** for important terms and definitions. Use ## for section headings. Use # for sub-headings. Number all steps clearly (1. 2. 3.). Write ALL formulas on separate lines in code blocks using backticks. For matrices, use format like [1 2 3] with square brackets. Give real-life examples where helpful. Use bullet points (-) for listing features/properties. NEVER output raw markdown code blocks - format directly as HTML-ready text. Make text look like textbook quality - clean, structured, professional.'
                    },
                    { role: "user", content: q }
                ],
                temperature: 0.7,
                max_tokens: 1024
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "HTTP " + res.status);

        const rawReply = data.choices[0].message.content;
        lastAIResponse = rawReply;

        const loaderEl = document.getElementById(lid);
        if (loaderEl) loaderEl.remove();

        const parsedHtml = window.parseMarkdown(rawReply);
        chat.innerHTML += '<div class="flex items-start gap-3"><div class="w-8 h-8 rounded-full bg-gradient-to-tr from-green-500 to-emerald-600 flex items-center justify-center text-white mt-1 shadow-sm flex-shrink-0"><i class="fa-solid fa-robot text-xs"></i></div><div class="ios-card p-4 rounded-2xl rounded-tl-none shadow-md text-sm text-gray-300 max-w-[90%] leading-relaxed ai-res">' + parsedHtml + '</div></div>';

        addXP(5, 'ai_chat');

    } catch (error) {
        console.error("Groq Error:", error);
        const loaderEl = document.getElementById(lid);
        if (loaderEl) loaderEl.remove();
        chat.innerHTML += '<div class="flex items-start gap-3"><div class="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white mt-1 shadow-sm flex-shrink-0"><i class="fa-solid fa-triangle-exclamation text-xs"></i></div><div class="ios-card p-3.5 rounded-2xl rounded-tl-none text-red-400 text-sm max-w-[85%] border border-red-500/20 shadow-md"><strong>Error:</strong> ' + escapeHtml(error.message) + '</div></div>';
    } finally {
        input.disabled = false;
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        chat.scrollTop = chat.scrollHeight;
        input.focus();
    }
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.speakLastMessage = function() {
    if (!lastAIResponse) { showToast("No message to read", "inf"); return; }
    const cleanText = lastAIResponse.replace(/[#*\[\]]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'hi-IN';
    utterance.rate = 0.85;
    const btn = document.querySelector('.vb');
    if (btn) btn.classList.add('sp');
    utterance.onend = function() { if (btn) btn.classList.remove('sp'); };
    utterance.onerror = function() { if (btn) btn.classList.remove('sp'); };
    speechSynthesis.speak(utterance);
};

// ==========================================
// TOAST
// ==========================================
window.showToast = function(msg, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    let icon = type === 'err' ? 'fa-triangle-exclamation' : type === 'suc' ? 'fa-check-circle' : type === 'warn' ? 'fa-exclamation-circle' : 'fa-info-circle';
    t.innerHTML = '<i class="fa-solid ' + icon + ' mt-1 flex-shrink-0"></i><span>' + msg + '</span>';
    container.appendChild(t);
    requestAnimationFrame(() => { t.classList.add('show'); });
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.remove(); }, 300); }, 3500);
};

// ==========================================
// ATTENDANCE (COMPACT)
// ==========================================
function loadAttendance() {
    const today = new Date().toISOString().split('T')[0];
    const saved = JSON.parse(localStorage.getItem('attendance') || '{}');
    const streak = parseInt(localStorage.getItem('streak') || '0');
    const sc = document.getElementById('streak-count');
    const ps = document.getElementById('prof-streak');
    if (sc) sc.textContent = streak;
    if (ps) ps.textContent = streak;
    const btn = document.getElementById('att-btn');
    if (saved[today] && btn) {
        btn.innerHTML = '<i class="fa-solid fa-check-double mr-2"></i> Marked!';
        btn.disabled = true;
        btn.classList.add('opacity-50');
    }
    const totalDays = Object.keys(saved).length;
    const daysPassed = new Date().getDate();
    const rate = daysPassed > 0 ? Math.round((totalDays / daysPassed) * 100) : 0;
    const ar = document.getElementById('attendance-rate');
    const pa = document.getElementById('prof-attendance');
    if (ar) ar.textContent = rate + '%';
    if (pa) pa.textContent = rate + '%';
    renderAttendanceCalendar(saved);
}

function renderAttendanceCalendar(saved) {
    const cal = document.getElementById('attendance-calendar');
    if (!cal) return;
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    let html = '';
    const dayNames = ['S','M','T','W','T','F','S'];
    dayNames.forEach(d => { html += '<div class="text-center text-[9px] font-bold text-gray-700 mb-0.5">' + d + '</div>'; });
    for (let i = 0; i < firstDay; i++) html += '<div></div>';
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
        const isToday = day === today.getDate();
        const isPresent = saved[dateStr];
        const isFuture = day > today.getDate();
        let cls = 'att-d';
        if (isPresent) cls += ' att-p';
        else if (isFuture) cls += ' att-f';
        else if (!isPresent && day < today.getDate()) cls += ' att-a';
        if (isToday) cls += ' att-t';
        html += '<div class="' + cls + '">' + day + '</div>';
    }
    cal.innerHTML = html;
}

window.markAttendance = function() {
    const today = new Date().toISOString().split('T')[0];
    const saved = JSON.parse(localStorage.getItem('attendance') || '{}');
    const lastDate = localStorage.getItem('lastAttendance');
    let streak = parseInt(localStorage.getItem('streak') || '0');
    if (saved[today]) { showToast("Aaj ki attendance pehle se hi mark hai!", "inf"); return; }
    saved[today] = true;
    if (lastDate) {
        const last = new Date(lastDate);
        const now = new Date();
        const diff = Math.floor((now - last) / 86400000);
        if (diff === 1) streak++;
        else if (diff > 1) streak = 1;
    } else { streak = 1; }
    localStorage.setItem('attendance', JSON.stringify(saved));
    localStorage.setItem('streak', streak.toString());
    localStorage.setItem('lastAttendance', today);
    const sc = document.getElementById('streak-count');
    const ps = document.getElementById('prof-streak');
    if (sc) sc.textContent = streak;
    if (ps) ps.textContent = streak;
    const btn = document.getElementById('att-btn');
    if (btn) { btn.innerHTML = '<i class="fa-solid fa-check-double mr-2"></i> Marked!'; btn.disabled = true; btn.classList.add('opacity-50'); }
    renderAttendanceCalendar(saved);
    showToast("Streak: " + streak + " din! Aise hi jari rakho!", "suc");
    addXP(10, 'attendance');
    if (streak >= 7) addBadge('streak_7', '7 Day Streak', 'amber');
    if (streak >= 30) addBadge('streak_30', '30 Day Streak', 'red');
    if (currentUser && db) {
        set(ref(db, 'users/' + currentUser.uid + '/attendance'), { streak: streak, lastDate: today, totalDays: Object.keys(saved).length });
    }
};

// ==========================================
// TIMER
// ==========================================
window.startTimer = function() {
    if (timerRunning) return;
    timerRunning = true;
    const ts = document.getElementById('timer-start');
    const tp = document.getElementById('timer-pause');
    if (ts) ts.classList.add('hidden');
    if (tp) tp.classList.remove('hidden');
    timerInterval = setInterval(() => {
        if (timerSeconds > 0) {
            timerSeconds--;
            updateTimerDisplay();
        } else {
            pauseTimer();
            showToast("Focus session complete! 5 minute ka break lo!", "suc");
            const totalFocus = parseInt(localStorage.getItem('totalFocus') || '0') + 25;
            localStorage.setItem('totalFocus', totalFocus);
            const pf = document.getElementById('prof-focus');
            if (pf) pf.textContent = Math.floor(totalFocus / 60);
            addXP(15, 'focus_timer');
            addBadge('focus_first', 'Focus Master', 'green');
        }
    }, 1000);
};

window.pauseTimer = function() {
    timerRunning = false;
    clearInterval(timerInterval);
    const ts = document.getElementById('timer-start');
    const tp = document.getElementById('timer-pause');
    if (ts) ts.classList.remove('hidden');
    if (tp) tp.classList.add('hidden');
};

window.resetTimer = function() {
    pauseTimer();
    timerSeconds = 25 * 60;
    updateTimerDisplay();
};

function updateTimerDisplay() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    const td = document.getElementById('timer-display');
    if (td) td.textContent = String(mins).padStart(2,'0') + ':' + String(secs).padStart(2,'0');
    const tc = document.getElementById('timer-circle');
    if (tc) tc.style.setProperty('--p', ((25 * 60 - timerSeconds) / (25 * 60)) * 100 + '%');
}

// ==========================================
// QUICK NOTES
// ==========================================
function loadQuickNotes() {
    const notes = JSON.parse(localStorage.getItem('quickNotes') || '[]');
    renderQuickNotes(notes);
}

function renderQuickNotes(notes) {
    const list = document.getElementById('quick-notes-list');
    if (!list) return;
    if (notes.length === 0) { list.innerHTML = '<div class="text-center text-gray-600 text-xs py-2">Koi notes nahi hain</div>'; return; }
    list.innerHTML = notes.map((note, i) => {
        return '<div class="flex justify-between items-center bg-yellow-500/5 p-2.5 rounded-lg border border-yellow-500/10"><span class="text-sm text-gray-400 flex-1 break-words pr-2">' + escapeHtml(note) + '</span><button onclick="deleteQuickNote(' + i + ')" class="text-red-400 hover:text-red-300 px-2 flex-shrink-0"><i class="fa-solid fa-times"></i></button></div>';
    }).join('');
}

window.addQuickNote = function() {
    const input = document.getElementById('quick-note-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const notes = JSON.parse(localStorage.getItem('quickNotes') || '[]');
    notes.unshift(text);
    if (notes.length > 10) notes.pop();
    localStorage.setItem('quickNotes', JSON.stringify(notes));
    input.value = '';
    renderQuickNotes(notes);
    showToast("Note saved!", "suc");
};

window.deleteQuickNote = function(index) {
    const notes = JSON.parse(localStorage.getItem('quickNotes') || '[]');
    notes.splice(index, 1);
    localStorage.setItem('quickNotes', JSON.stringify(notes));
    renderQuickNotes(notes);
};

// ==========================================
// CATEGORIZED NOTES
// ==========================================
window.filterNotes = function(category) {
    currentNoteFilter = category;
    document.querySelectorAll('.cat-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.cat === category);
    });
    renderNotesList();
};

function renderNotesList() {
    const list = document.getElementById('notes-list');
    if (!list) return;
    let filtered = cachedNotes;
    if (currentNoteFilter !== 'all') {
        filtered = cachedNotes.filter(n => (n.category || 'other').toLowerCase() === currentNoteFilter);
    }
    if (filtered.length === 0) {
        list.innerHTML = '<div class="text-center text-gray-600 py-6"><i class="fa-solid fa-book-open text-4xl mb-3 text-gray-700 block"></i>No notes in this category.</div>';
        return;
    }

    const subjectColors = {
        physics: { bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.3)', text: '#818cf8', icon: 'fa-atom' },
        chemistry: { bg: 'rgba(52,199,89,0.15)', border: 'rgba(52,199,89,0.3)', text: '#34c759', icon: 'fa-flask' },
        maths: { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', text: '#a855f7', icon: 'fa-calculator' },
        math: { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', text: '#a855f7', icon: 'fa-calculator' },
        english: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#3b82f6', icon: 'fa-book' },
        hindi: { bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.3)', text: '#f97316', icon: 'fa-om' },
        other: { bg: 'rgba(142,142,147,0.15)', border: 'rgba(142,142,147,0.3)', text: '#8e8e93', icon: 'fa-folder' },
        default: { bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.3)', text: '#818cf8', icon: 'fa-file-pdf' }
    };

    list.innerHTML = filtered.map(item => {
        const cat = (item.category || 'other').toLowerCase();
        const colors = subjectColors[cat] || subjectColors.default;
        const topic = item.topic || item.title || 'Study Material';
        const dateStr = item.date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const catDisplay = item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : 'PDF';
        return '<div class="note-card">' +
            '<div class="note-card-header">' +
                '<div class="flex items-center justify-between">' +
                    '<span class="note-subject-badge" style="background:' + colors.bg + ';border:1px solid ' + colors.border + ';color:' + colors.text + '">' +
                        '<i class="fa-solid ' + colors.icon + '"></i> ' + catDisplay +
                    '</span>' +
                    '<span class="text-[10px] text-gray-600 font-medium">' + dateStr + '</span>' +
                '</div>' +
                '<h4 class="note-topic">' + topic + '</h4>' +
            '</div>' +
            '<a href="' + item.link + '" target="_blank" rel="noopener" class="note-open-btn">' +
                '<i class="fa-solid fa-external-link-alt"></i> Open in Browser' +
            '</a>' +
        '</div>';
    }).join('');
}

// ==========================================
// ONLINE CLASSES
// ==========================================
window.filterClasses = function(category) {
    currentClassFilter = category;
    document.querySelectorAll('.cls-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.cat === category);
    });
    renderClassesList();
};

function renderClassesList() {
    const list = document.getElementById('classes-list');
    if (!list) return;
    let filtered = cachedClasses;
    if (currentClassFilter !== 'all') {
        filtered = cachedClasses.filter(c => (c.category || 'other').toLowerCase() === currentClassFilter);
    }
    if (filtered.length === 0) {
        list.innerHTML = '<div class="text-center text-gray-600 py-6"><i class="fa-solid fa-video text-4xl mb-3 text-gray-700 block"></i>No classes in this category.</div>';
        return;
    }

    const subjectColors = {
        physics: { grad: 'from-indigo-500 to-purple-600', icon: 'fa-atom' },
        chemistry: { grad: 'from-green-500 to-emerald-600', icon: 'fa-flask' },
        maths: { grad: 'from-blue-500 to-cyan-600', icon: 'fa-calculator' },
        math: { grad: 'from-blue-500 to-cyan-600', icon: 'fa-calculator' },
        english: { grad: 'from-pink-500 to-rose-600', icon: 'fa-book' },
        hindi: { grad: 'from-orange-500 to-amber-600', icon: 'fa-om' },
        other: { grad: 'from-gray-500 to-gray-600', icon: 'fa-video' },
        default: { grad: 'from-indigo-500 to-purple-600', icon: 'fa-video' }
    };

    list.innerHTML = filtered.map(item => {
        const cat = (item.category || 'other').toLowerCase();
        const colors = subjectColors[cat] || subjectColors.default;
        const title = item.title || 'Online Class';
        const catDisplay = item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : 'Other';
        // Extract video ID for thumbnail
        let videoId = '';
        if (item.link) {
            if (item.link.includes('youtube.com/watch?v=')) videoId = item.link.split('v=')[1]?.split('&')[0];
            else if (item.link.includes('youtu.be/')) videoId = item.link.split('youtu.be/')[1]?.split('?')[0];
        }
        const thumbnail = videoId ? 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg' : '';

        return '<a href="' + item.link + '" target="_blank" rel="noopener" class="video-card">' +
            '<div class="video-thumbnail ' + (thumbnail ? '' : 'bg-gradient-to-tr ' + colors.grad) + '" style="' + (thumbnail ? 'background-image:url(' + thumbnail + ');' : '') + '">' +
                (thumbnail ? '<div class="video-play-overlay"><i class="fa-solid fa-play"></i></div>' : '<i class="fa-solid ' + colors.icon + ' text-3xl text-white"></i>') +
            '</div>' +
            '<div class="video-info">' +
                '<h4 class="video-title">' + title + '</h4>' +
                '<span class="video-category ' + colors.grad + '">' + catDisplay + '</span>' +
            '</div>' +
        '</a>';
    }).join('');
}

// ==========================================
// MUSIC HUB (PREMIUM WITH BACKGROUND + EXP)
// ==========================================
function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) return;
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}
loadYouTubeAPI();

function initHubVisualizer() {
    const viz = document.getElementById('hub-visualizer');
    if (!viz || viz.children.length > 0) return;
    for (let i = 0; i < 16; i++) {
        const bar = document.createElement('div');
        bar.className = 'vzb';
        bar.style.height = '3px';
        viz.appendChild(bar);
    }
}

function animateVisualizer() {
    document.querySelectorAll('.vzb').forEach(bar => {
        bar.style.height = (3 + Math.random() * 28) + 'px';
    });
}

async function fetchVideoTitle(videoId) {
    try {
        const res = await fetch('https://noembed.com/embed?url=https://www.youtube.com/watch?v=' + videoId);
        const data = await res.json();
        return data.title || 'YouTube Audio';
    } catch (e) { return 'YouTube Audio'; }
}

function extractVideoId(url) {
    let videoId = '';
    if (url.includes('youtube.com/watch?v=')) videoId = url.split('v=')[1]?.split('&')[0];
    else if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1]?.split('?')[0];
    else if (url.includes('youtube.com/embed/')) videoId = url.split('embed/')[1]?.split('?')[0];
    else if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) videoId = url.trim();
    return videoId;
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
}

function updateSeekbar() {
    if (!youtubePlayer || typeof youtubePlayer.getCurrentTime !== 'function') return;
    try {
        currentVideoTime = youtubePlayer.getCurrentTime() || 0;
        currentVideoDuration = youtubePlayer.getDuration() || 0;
        const pct = currentVideoDuration > 0 ? (currentVideoTime / currentVideoDuration) * 100 : 0;
        const fill = document.getElementById('hub-seekbar-fill');
        const curEl = document.getElementById('hub-seek-current');
        const durEl = document.getElementById('hub-seek-duration');
        if (fill) fill.style.width = pct + '%';
        if (curEl) curEl.textContent = formatTime(currentVideoTime);
        if (durEl) durEl.textContent = formatTime(currentVideoDuration);
    } catch (e) {}
}

window.seekTo = function(event) {
    const track = document.getElementById('hub-seekbar-track');
    if (!track || !youtubePlayer || typeof youtubePlayer.seekTo !== 'function') return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const newTime = pct * currentVideoDuration;
    youtubePlayer.seekTo(newTime, true);
    updateSeekbar();
};

window.skipForward = function() {
    if (!youtubePlayer || typeof youtubePlayer.seekTo !== 'function') return;
    youtubePlayer.seekTo(Math.min(currentVideoDuration, currentVideoTime + 10), true);
    updateSeekbar();
};

window.skipBackward = function() {
    if (!youtubePlayer || typeof youtubePlayer.seekTo !== 'function') return;
    youtubePlayer.seekTo(Math.max(0, currentVideoTime - 10), true);
    updateSeekbar();
};

window.loadYouTubeMusic = async function() {
    const linkInput = document.getElementById('hub-yt-link');
    if (!linkInput) return;
    const url = linkInput.value.trim();
    if (!url) return;
    const videoId = extractVideoId(url);
    if (!videoId) { showToast("Invalid YouTube link", "err"); return; }

    currentVideoId = videoId;
    showToast("Loading song...", "inf");
    currentVideoTitle = await fetchVideoTitle(videoId);

    const ht = document.getElementById('hub-song-title');
    const hs = document.getElementById('hub-song-status');
    if (ht) ht.textContent = currentVideoTitle;
    if (hs) hs.textContent = 'Now Playing';

    const playlist = JSON.parse(localStorage.getItem('sg_playlist') || '[]');
    if (!playlist.find(p => p.id === currentVideoId)) {
        playlist.push({ id: currentVideoId, title: currentVideoTitle });
        localStorage.setItem('sg_playlist', JSON.stringify(playlist));
        loadHubPlaylist();
    }

    loadYouTubePlayer(videoId, currentVideoTitle);
    linkInput.value = '';
    showToast(currentVideoTitle + " loaded!", "suc");
};

function loadYouTubePlayer(videoId, title) {
    const ytp = document.getElementById('yt-player');
    if (ytp) {
        ytp.innerHTML = '<div id="yt-iframe-container"></div>';
        try {
            youtubePlayer = new YT.Player('yt-iframe-container', {
                width: 1,
                height: 1,
                videoId: videoId,
                playerVars: { autoplay: 1, controls: 0, disablekb: 1 },
                events: {
                    onReady: function(event) {
                        event.target.playVideo();
                        setTimeout(() => {
                            currentVideoDuration = youtubePlayer.getDuration() || 0;
                            const durEl = document.getElementById('hub-seek-duration');
                            if (durEl) durEl.textContent = formatTime(currentVideoDuration);
                            setupMediaSession(title);
                        }, 1000);
                    },
                    onStateChange: function(event) {
                        if (event.data === YT.PlayerState.PLAYING) {
                            isPlaying = true;
                            const pi = document.getElementById('hub-play-icon');
                            const di = document.getElementById('hub-disc-icon');
                            const glow = document.getElementById('music-glow');
                            if (pi) { pi.classList.remove('fa-play'); pi.classList.add('fa-pause'); }
                            if (di) { di.className = 'fa-solid fa-compact-disc fa-spin'; }
                            if (glow) glow.classList.add('active');
                            if (!visualizerInterval) visualizerInterval = setInterval(animateVisualizer, 120);
                            if (!seekbarInterval) seekbarInterval = setInterval(updateSeekbar, 1000);
                            startMusicXPTracking();
                        } else if (event.data === YT.PlayerState.PAUSED) {
                            isPlaying = false;
                            const pi = document.getElementById('hub-play-icon');
                            const di = document.getElementById('hub-disc-icon');
                            const glow = document.getElementById('music-glow');
                            if (pi) { pi.classList.remove('fa-pause'); pi.classList.add('fa-play'); }
                            if (di) { di.className = 'fa-solid fa-compact-disc'; }
                            if (glow) glow.classList.remove('active');
                            if (visualizerInterval) { clearInterval(visualizerInterval); visualizerInterval = null; }
                            if (seekbarInterval) { clearInterval(seekbarInterval); seekbarInterval = null; }
                            document.querySelectorAll('.vzb').forEach(bar => { bar.style.height = '3px'; });
                            stopMusicXPTracking();
                        } else if (event.data === YT.PlayerState.ENDED) {
                            isPlaying = false;
                            const pi = document.getElementById('hub-play-icon');
                            if (pi) { pi.classList.remove('fa-pause'); pi.classList.add('fa-play'); }
                            stopMusicXPTracking();
                            if (playlistMode) nextTrack();
                        }
                    }
                }
            });
        } catch (e) {
            ytp.innerHTML = '<iframe id="yt-iframe" width="1" height="1" src="https://www.youtube.com/embed/' + videoId + '?enablejsapi=1&autoplay=1&controls=0" frameborder="0" allow="autoplay"></iframe>';
        }
        ytp.classList.remove('hidden');
    }
}

// MediaSession API for background playback
function setupMediaSession(title) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: 'StudyGram Pro Music',
            album: 'Study & Focus',
            artwork: [
                { src: 'https://cdn-icons-png.flaticon.com/512/727/727218.png', sizes: '512x512', type: 'image/png' }
            ]
        });
        navigator.mediaSession.setActionHandler('play', () => { if (youtubePlayer) youtubePlayer.playVideo(); });
        navigator.mediaSession.setActionHandler('pause', () => { if (youtubePlayer) youtubePlayer.pauseVideo(); });
        navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
        navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    }
}

// +10 EXP per minute listening
function startMusicXPTracking() {
    musicListenStart = Date.now();
    if (musicXPInterval) clearInterval(musicXPInterval);
    musicXPInterval = setInterval(() => {
        musicTotalListened++;
        if (musicTotalListened % 60 === 0) {
            musicEarnedXP += 10;
            addXP(10, 'music_listen');
            const earnEl = document.getElementById('music-earn-xp');
            const earnDisplay = document.getElementById('music-earn-display');
            if (earnEl) earnEl.textContent = musicEarnedXP;
            if (earnDisplay) earnDisplay.classList.remove('hidden');
            showToast('+10 EXP for listening to music!', 'suc');
        }
    }, 1000);
}

function stopMusicXPTracking() {
    if (musicXPInterval) {
        clearInterval(musicXPInterval);
        musicXPInterval = null;
    }
    musicListenStart = 0;
}

window.togglePlay = function() {
    if (!youtubePlayer || typeof youtubePlayer.playVideo !== 'function') return;
    if (isPlaying) youtubePlayer.pauseVideo();
    else youtubePlayer.playVideo();
};

window.setVolume = function(val) {
    if (!youtubePlayer || typeof youtubePlayer.setVolume !== 'function') {
        const iframe = document.getElementById('yt-iframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(JSON.stringify({event:'command',func:'setVolume',args:[val]}), '*');
        }
        return;
    }
    youtubePlayer.setVolume(val);
};

window.togglePlaylistMode = function() {
    playlistMode = !playlistMode;
    const btn = document.getElementById('hub-playlist-toggle');
    if (btn) {
        if (playlistMode) {
            btn.innerHTML = '<i class="fa-solid fa-repeat mr-1"></i> Loop: On';
            btn.classList.add('bg-[#6366f1]/15','text-[#818cf8]');
        } else {
            btn.innerHTML = '<i class="fa-solid fa-repeat mr-1"></i> Loop: Off';
            btn.classList.remove('bg-[#6366f1]/15','text-[#818cf8]');
        }
    }
};

function loadHubPlaylist() {
    const playlist = JSON.parse(localStorage.getItem('sg_playlist') || '[]');
    const container = document.getElementById('hub-playlist-items');
    if (!container) return;
    if (playlist.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-600 text-sm py-6"><i class="fa-solid fa-music text-4xl mb-3 text-gray-700 block"></i>No songs yet. Add YouTube links!</div>';
        return;
    }
    container.innerHTML = playlist.map((item, i) => {
        const isActive = item.id === currentVideoId;
        return '<div class="flex items-center gap-3 p-3 rounded-xl ' + (isActive ? 'bg-[#6366f1]/15 border border-[#6366f1]/30' : 'bg-[#2c2c2e] border border-white/5') + ' cursor-pointer hover:bg-[#3a3a3c] transition-all" onclick="playFromPlaylist(' + i + ')"><div class="w-10 h-10 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm flex-shrink-0"><i class="fa-solid fa-music"></i></div><div class="flex-1 min-w-0"><p class="font-bold text-sm text-white truncate">' + item.title + '</p></div><button onclick="event.stopPropagation(); removeFromPlaylist(' + i + ')" class="text-red-400 hover:text-red-300 text-xs px-2 flex-shrink-0 w-7 h-7 rounded-full bg-[#1c1c1e] flex items-center justify-center"><i class="fa-solid fa-times"></i></button></div>';
    }).join('');
}

window.playFromPlaylist = async function(index) {
    const playlist = JSON.parse(localStorage.getItem('sg_playlist') || '[]');
    if (!playlist[index]) return;
    const item = playlist[index];
    currentVideoId = item.id;
    currentVideoTitle = item.title;
    const ht = document.getElementById('hub-song-title');
    const hs = document.getElementById('hub-song-status');
    if (ht) ht.textContent = item.title;
    if (hs) hs.textContent = 'Now Playing';
    loadHubPlaylist();
    loadYouTubePlayer(item.id, item.title);
};

window.removeFromPlaylist = function(index) {
    const playlist = JSON.parse(localStorage.getItem('sg_playlist') || '[]');
    playlist.splice(index, 1);
    localStorage.setItem('sg_playlist', JSON.stringify(playlist));
    loadHubPlaylist();
};

window.clearPlaylist = function() {
    if (confirm("Clear all songs from playlist?")) {
        localStorage.removeItem('sg_playlist');
        loadHubPlaylist();
        showToast("Playlist cleared!", "inf");
    }
};

window.prevTrack = function() {
    const playlist = JSON.parse(localStorage.getItem('sg_playlist') || '[]');
    if (playlist.length === 0) return;
    let idx = playlist.findIndex(p => p.id === currentVideoId);
    if (idx <= 0) idx = playlist.length;
    playFromPlaylist(idx - 1);
};

window.nextTrack = function() {
    const playlist = JSON.parse(localStorage.getItem('sg_playlist') || '[]');
    if (playlist.length === 0) return;
    let idx = playlist.findIndex(p => p.id === currentVideoId);
    if (idx < 0 || idx >= playlist.length - 1) idx = -1;
    playFromPlaylist(idx + 1);
};

window.onYouTubeIframeAPIReady = function() { console.log('YouTube API Ready'); };

// ==========================================
// EXAM DATE SHEET (SORTED + PROFESSIONAL)
// ==========================================
function loadDateSheet() {
    if (!db) return;
    onValue(ref(db, 'public_data/exam_schedule'), (snap) => {
        const list = document.getElementById('datesheet-list');
        if (!list) return;
        if (!snap.exists()) {
            list.innerHTML = '<div class="text-center text-gray-600 py-6 flex flex-col items-center"><i class="fa-solid fa-calendar-xmark text-4xl mb-3 text-gray-700"></i><p>No exams scheduled yet.</p></div>';
            return;
        }
        let exams = [];
        snap.forEach(child => {
            const d = child.val();
            exams.push({ ...d, key: child.key });
        });
        // Sort by date, then by time
        exams.sort((a, b) => {
            const dateA = (a.date || '9999-12-31') + 'T' + (a.time || '23:59');
            const dateB = (b.date || '9999-12-31') + 'T' + (b.time || '23:59');
            return dateA.localeCompare(dateB);
        });

        list.innerHTML = exams.map((exam, i) => {
            const dateObj = new Date(exam.date + 'T' + (exam.time || '00:00'));
            const dateStr = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const timeStr = exam.time || 'TBA';
            const isUpcoming = dateObj > new Date();
            const subjectColors = {
                hindi: 'from-orange-500 to-amber-600',
                english: 'from-pink-500 to-rose-600',
                math: 'from-blue-500 to-cyan-600',
                maths: 'from-blue-500 to-cyan-600',
                physics: 'from-indigo-500 to-purple-600',
                chemistry: 'from-green-500 to-emerald-600',
                default: 'from-gray-500 to-gray-600'
            };
            const subjKey = (exam.subject || '').toLowerCase();
            const grad = subjectColors[subjKey] || subjectColors.default;
            return '<div class="datesheet-card ' + (isUpcoming ? 'upcoming' : 'past') + '">' +
                '<div class="datesheet-header bg-gradient-to-r ' + grad + '">' +
                    '<span class="datesheet-index">#' + (i + 1) + '</span>' +
                    '<span class="datesheet-status">' + (isUpcoming ? 'UPCOMING' : 'COMPLETED') + '</span>' +
                '</div>' +
                '<div class="datesheet-body">' +
                    '<h3 class="font-black text-white text-lg">' + exam.subject + '</h3>' +
                    '<p class="text-xs text-gray-500 font-medium mt-0.5">' + exam.examName + '</p>' +
                    '<div class="datesheet-meta">' +
                        '<span><i class="fa-regular fa-calendar"></i> ' + dateStr + '</span>' +
                        '<span><i class="fa-regular fa-clock"></i> ' + timeStr + '</span>' +
                    '</div>' +
                    '<div class="datesheet-shift"><i class="fa-solid fa-door-open"></i> ' + (exam.meeting || 'TBA') + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    });
}

// ==========================================
// DATABASE LOADING
// ==========================================
function loadDatabaseData() {
    if (!db) return;

    // Users
    onValue(ref(db, 'users'), (snap) => {
        const totalUsers = snap.exists() ? Object.keys(snap.val()).length : 0;
        const stu = document.getElementById('stat-total-users');
        const uc = document.getElementById('user-count');
        if (stu) stu.textContent = totalUsers;
        if (uc) uc.textContent = totalUsers;
        let activeToday = 0;
        let premiumCount = 0;
        const today = new Date().toISOString().split('T')[0];
        if (snap.exists()) {
            snap.forEach(child => {
                if (child.val().lastActive === today) activeToday++;
                if (child.val().isPremium === true) premiumCount++;
            });
        }
        const sat = document.getElementById('stat-active-today');
        if (sat) sat.textContent = activeToday;
        const stp = document.getElementById('stat-total-premium');
        if (stp) stp.textContent = premiumCount;

        const usersList = document.getElementById('users-list');
        if (snap.exists() && usersList) {
            let html = '';
            snap.forEach(child => {
                const data = child.val();
                const stats = data.stats || {};
                const isPrem = data.isPremium === true;
                html += '<div class="flex items-center gap-3 bg-[#2c2c2e] p-3 rounded-xl border border-white/10"><img src="' + (data.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png') + '" class="w-9 h-9 rounded-full object-cover border border-white/10" onerror="this.src=\'https://cdn-icons-png.flaticon.com/512/149/149071.png\'"><div class="flex-1 min-w-0"><p class="font-bold text-sm text-white truncate">' + (data.name || 'Unknown') + (isPrem ? ' <i class="fa-solid fa-crown text-amber-400 text-xs"></i>' : '') + '</p><p class="text-xs text-gray-600 truncate">' + (data.email || '') + '</p></div><div class="text-right flex-shrink-0"><span class="text-xs font-bold bg-[#6366f1]/10 text-indigo-300 px-2 py-1 rounded border border-[#6366f1]/20">Lv.' + (stats.level || 1) + '</span></div></div>';
            });
            usersList.innerHTML = html;
        } else if (usersList) { usersList.innerHTML = '<div class="text-center text-gray-600 text-sm py-4">Koi users nahi mile</div>'; }
    });

    // Notes (cached for category filtering)
    onValue(ref(db, 'public_data/notes'), (snap) => {
        const adminList = document.getElementById('manage-notes-list');
        const stn = document.getElementById('stat-total-notes');
        if (stn) stn.textContent = snap.exists() ? Object.keys(snap.val()).length : 0;
        cachedNotes = [];
        if (adminList) adminList.innerHTML = '';
        if (snap.exists()) {
            snap.forEach(c => {
                let d = c.val();
                d._key = c.key;
                cachedNotes.push(d);
                if (adminList) adminList.innerHTML += '<div class="flex justify-between items-center bg-[#2c2c2e] p-2 rounded-lg border border-white/10 text-sm"><span class="truncate pr-2 text-gray-400">' + (d.category || 'PDF') + ' - ' + (d.topic || d.title) + '</span><button onclick="deleteItem(\'public_data/notes/' + c.key + '\')" class="text-red-400 hover:text-red-300 bg-red-500/10 p-1.5 rounded active:scale-90 transition-transform btn-press border border-red-500/20 flex-shrink-0"><i class="fa-solid fa-trash"></i></button></div>';
            });
        } else {
            if (adminList) adminList.innerHTML = '<span class="text-xs text-gray-600">Koi notes nahi</span>';
        }
        renderNotesList();
    });

    // Online Classes (cached for category filtering)
    onValue(ref(db, 'public_data/classes'), (snap) => {
        const adminList = document.getElementById('manage-classes-list');
        const stc = document.getElementById('stat-total-classes');
        if (stc) stc.textContent = snap.exists() ? Object.keys(snap.val()).length : 0;
        cachedClasses = [];
        if (adminList) adminList.innerHTML = '';
        if (snap.exists()) {
            snap.forEach(c => {
                let d = c.val();
                d._key = c.key;
                cachedClasses.push(d);
                if (adminList) adminList.innerHTML += '<div class="flex justify-between items-center bg-[#2c2c2e] p-2 rounded-lg border border-white/10 text-sm"><span class="truncate pr-2 text-gray-400">' + (d.category || 'Other') + ' - ' + (d.title || 'Class') + '</span><button onclick="deleteItem(\'public_data/classes/' + c.key + '\')" class="text-red-400 hover:text-red-300 bg-red-500/10 p-1.5 rounded active:scale-90 transition-transform btn-press border border-red-500/20 flex-shrink-0"><i class="fa-solid fa-trash"></i></button></div>';
            });
        } else {
            if (adminList) adminList.innerHTML = '<span class="text-xs text-gray-600">Koi classes nahi</span>';
        }
        renderClassesList();
    });

    // Progress/Syllabus
    onValue(ref(db, 'public_data/status'), (snap) => {
        const box = document.getElementById('course-status');
        if (!box) return;
        const d = snap.val() || { hin:0, eng:0, math:0, phy:0, chem:0, hin_gadya:0, hin_padya:0, hin_kahani:0, hin_natak:0, hin_vyakaran:0, hin_sanskrit:0, eng_prose:0, eng_poetry:0, eng_supp:0, eng_grammar:0 };
        const hexColors = { hin:'#f97316', eng:'#3b82f6', math:'#10b981', phy:'#6366f1', chem:'#a855f7' };
        const names = { hin:'Hindi', eng:'English', math:'Maths', phy:'Physics', chem:'Chemistry' };
        let html = '<div class="flex justify-between items-center mb-4"><h4 class="font-bold text-white flex items-center gap-2"><i class="fa-solid fa-chart-simple text-indigo-400"></i> Syllabus Coverage</h4></div><div class="space-y-5">';
        ['hin','eng','math','phy','chem'].forEach(s => {
            let val = d[s] || 0;
            let detailHtml = '';
            if (s === 'hin') {
                detailHtml = '<div class="sub-d"><div class="sp"><span class="text-gray-500">Gadya</span><div class="spb"><div class="spf" style="width:' + (d.hin_gadya||0) + '%;background:#f97316"></div></div><span class="text-xs font-bold text-orange-400">' + (d.hin_gadya||0) + '%</span></div><div class="sp"><span class="text-gray-500">Padya</span><div class="spb"><div class="spf" style="width:' + (d.hin_padya||0) + '%;background:#f97316"></div></div><span class="text-xs font-bold text-orange-400">' + (d.hin_padya||0) + '%</span></div><div class="sp"><span class="text-gray-500">Kahani</span><div class="spb"><div class="spf" style="width:' + (d.hin_kahani||0) + '%;background:#f97316"></div></div><span class="text-xs font-bold text-orange-400">' + (d.hin_kahani||0) + '%</span></div><div class="sp"><span class="text-gray-500">Natak</span><div class="spb"><div class="spf" style="width:' + (d.hin_natak||0) + '%;background:#f97316"></div></div><span class="text-xs font-bold text-orange-400">' + (d.hin_natak||0) + '%</span></div><div class="sp"><span class="text-gray-500">Vyakaran</span><div class="spb"><div class="spf" style="width:' + (d.hin_vyakaran||0) + '%;background:#f97316"></div></div><span class="text-xs font-bold text-orange-400">' + (d.hin_vyakaran||0) + '%</span></div><div class="sp"><span class="text-gray-500">Sanskrit</span><div class="spb"><div class="spf" style="width:' + (d.hin_sanskrit||0) + '%;background:#f97316"></div></div><span class="text-xs font-bold text-orange-400">' + (d.hin_sanskrit||0) + '%</span></div></div>';
            } else if (s === 'eng') {
                detailHtml = '<div class="sub-d"><div class="sp"><span class="text-gray-500">Prose</span><div class="spb"><div class="spf" style="width:' + (d.eng_prose||0) + '%;background:#3b82f6"></div></div><span class="text-xs font-bold text-blue-400">' + (d.eng_prose||0) + '%</span></div><div class="sp"><span class="text-gray-500">Poetry</span><div class="spb"><div class="spf" style="width:' + (d.eng_poetry||0) + '%;background:#3b82f6"></div></div><span class="text-xs font-bold text-blue-400">' + (d.eng_poetry||0) + '%</span></div><div class="sp"><span class="text-gray-500">Supplementary</span><div class="spb"><div class="spf" style="width:' + (d.eng_supp||0) + '%;background:#3b82f6"></div></div><span class="text-xs font-bold text-blue-400">' + (d.eng_supp||0) + '%</span></div><div class="sp"><span class="text-gray-500">Grammar</span><div class="spb"><div class="spf" style="width:' + (d.eng_grammar||0) + '%;background:#3b82f6"></div></div><span class="text-xs font-bold text-blue-400">' + (d.eng_grammar||0) + '%</span></div></div>';
            }
            html += '<div><p class="text-xs font-bold uppercase flex justify-between text-gray-400 mb-1.5">' + names[s] + ' <span>' + val + '%</span></p><div class="h-2 bg-[#2c2c2e] rounded-full shadow-inner border border-white/10"><div class="h-full rounded-full transition-all duration-1000 ease-out" style="width:' + val + '%;background:' + hexColors[s] + ';opacity:0.7"></div></div>' + detailHtml + '</div>';
        });
        box.innerHTML = html + '</div>';
    });

    // Notices (with white-space: pre-wrap)
    onValue(ref(db, 'public_data/notices'), (snap) => {
        const list = document.getElementById('notice-list');
        const adminList = document.getElementById('manage-notices-list');
        if (list) list.innerHTML = '';
        if (adminList) adminList.innerHTML = '';
        const stn = document.getElementById('stat-total-notices');
        if (stn) stn.textContent = snap.exists() ? Object.keys(snap.val()).length : 0;
        if (snap.exists()) {
            snap.forEach(c => {
                let d = c.val(); let k = c.key;
                if (list) list.innerHTML = '<div class="ios-card p-4 rounded-2xl mb-3 border-l-4 border-amber-400 relative overflow-hidden"><div class="absolute -right-4 -top-4 text-amber-400/10 text-5xl opacity-30"><i class="fa-solid fa-bell"></i></div><h4 class="font-bold text-white relative z-10">' + d.title + '</h4><p class="text-[10px] text-gray-600 mt-1 uppercase tracking-wider relative z-10 font-bold">' + d.date + '</p><p class="text-sm mt-2 text-gray-400 relative z-10 leading-relaxed notice-text">' + d.msg + '</p></div>' + list.innerHTML;
                if (adminList) adminList.innerHTML += '<div class="flex justify-between items-center bg-[#2c2c2e] p-2 rounded-lg border border-white/10 text-sm"><span class="truncate pr-2 text-gray-400">' + d.title + '</span><button onclick="deleteItem(\'public_data/notices/' + k + '\')" class="text-red-400 hover:text-red-300 bg-red-500/10 p-1.5 rounded active:scale-90 transition-transform btn-press border border-red-500/20 flex-shrink-0"><i class="fa-solid fa-trash"></i></button></div>';
            });
        } else {
            if (list) list.innerHTML = '<div class="text-center text-gray-600 py-6">Koi updates nahi hain.</div>';
            if (adminList) adminList.innerHTML = '<span class="text-xs text-gray-600">Koi notices nahi</span>';
        }
    });

    // Exam Schedule (for modal)
    onValue(ref(db, 'public_data/exam_schedule'), (snap) => {
        const list = document.getElementById('modal-schedule-list');
        const adminList = document.getElementById('manage-exams-list');
        if (list) list.innerHTML = '';
        if (adminList) adminList.innerHTML = '';
        if (snap.exists()) {
            snap.forEach(c => {
                let d = c.val(); let k = c.key;
                if (list) list.innerHTML += '<div class="ios-card p-4 rounded-xl mb-3 shadow-md border border-[#6366f1]/20"><div class="flex justify-between items-start mb-2"><span class="bg-[#6366f1] text-white text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide">' + d.examName + '</span><span class="text-xs font-bold text-indigo-300 bg-[#6366f1]/10 px-2 py-1 rounded border border-[#6366f1]/20"><i class="fa-regular fa-calendar text-indigo-400 mr-1"></i> ' + d.date + '</span></div><h3 class="font-black text-white text-lg mt-1">' + d.subject + '</h3><div class="flex justify-between text-xs text-gray-500 mt-3 font-medium bg-[#2c2c2e] p-2 rounded-lg border border-white/10"><span><i class="fa-regular fa-clock text-gray-600 mr-1"></i>' + d.time + '</span><span><i class="fa-solid fa-door-open text-gray-600 mr-1"></i>' + d.meeting + '</span></div></div>';
                if (adminList) adminList.innerHTML += '<div class="flex justify-between items-center bg-[#2c2c2e] p-2 rounded-lg border border-white/10 text-sm"><span class="truncate pr-2 text-gray-400">' + d.subject + ' (' + d.examName + ')</span><button onclick="deleteItem(\'public_data/exam_schedule/' + k + '\')" class="text-red-400 hover:text-red-300 bg-red-500/10 p-1.5 rounded active:scale-90 transition-transform btn-press border border-red-500/20 flex-shrink-0"><i class="fa-solid fa-trash"></i></button></div>';
            });
        } else {
            if (list) list.innerHTML = '<div class="text-center text-gray-600 py-6 flex flex-col items-center"><i class="fa-solid fa-mug-hot text-4xl mb-3 text-gray-700"></i>Koi exams scheduled nahi! Relax!</div>';
            if (adminList) adminList.innerHTML = '<span class="text-xs text-gray-600">Koi exams nahi</span>';
        }
    });

    // Countdown
    onValue(ref(db, 'public_data/countdown'), (snap) => {
        if (snap.exists()) {
            const val = snap.val();
            if (typeof val === 'object' && val !== null) {
                if (val.date) {
                    globalTargetDate = new Date(val.date);
                    if (isNaN(globalTargetDate.getTime())) globalTargetDate = new Date("2026-02-15T00:00:00");
                }
                if (val.examName) globalExamName = val.examName;
            } else if (typeof val === 'string') {
                globalTargetDate = new Date(val);
                if (isNaN(globalTargetDate.getTime())) globalTargetDate = new Date("2026-02-15T00:00:00");
            }
            const labelEl = document.getElementById('exam-countdown-label');
            if (labelEl) labelEl.textContent = globalExamName;
        }
    });
}

// ==========================================
// DELETE
// ==========================================
window.deleteItem = async function(path) {
    if (!db) return;
    if (confirm("Kya aap ise delete karna chahte hain?")) {
        try { await remove(ref(db, path)); showToast("Item Deleted!", "suc"); }
        catch (e) { showToast("Delete failed", "err"); }
    }
};

// ==========================================
// ADMIN
// ==========================================
window.unlockAdmin = function() {
    const pass = document.getElementById('admin-pass').value;
    const errorEl = document.getElementById('admin-error');
    if (pass === "unlock") {
        document.getElementById('admin-auth').classList.add('hidden');
        document.getElementById('admin-controls').classList.remove('hidden');
        document.getElementById('admin-pass').value = '';
        if (errorEl) errorEl.classList.add('hidden');
        showToast("Portal Unlocked", "suc");
    } else {
        if (errorEl) { errorEl.textContent = "Galat Master Key!"; errorEl.classList.remove('hidden'); }
        showToast("Galat Key", "err");
    }
};

window.lockAdmin = function() {
    document.getElementById('admin-auth').classList.remove('hidden');
    document.getElementById('admin-controls').classList.add('hidden');
    showToast("Portal Locked", "inf");
};

window.adminAction = async function(type) {
    if (!db) { showToast("Database not connected", "err"); return; }
    try {
        if (type === 'note') {
            const category = document.getElementById('n-category').value;
            const topic = document.getElementById('n-topic').value.trim();
            const l = document.getElementById('n-link').value.trim();
            if (!topic || !l) return showToast("All fields required", "err");
            const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            await push(ref(db, 'public_data/notes'), { category, topic, title: topic, link: l, date: dateStr });
        } else if (type === 'class') {
            const category = document.getElementById('vc-category').value;
            const title = document.getElementById('vc-title').value.trim();
            const l = document.getElementById('vc-link').value.trim();
            if (!title || !l) return showToast("All fields required", "err");
            await push(ref(db, 'public_data/classes'), { category, title, link: l });
        } else if (type === 'progress') {
            const data = {
                hin: Math.min(100, Math.max(0, parseInt(document.getElementById('p-hin').value) || 0)),
                eng: Math.min(100, Math.max(0, parseInt(document.getElementById('p-eng').value) || 0)),
                math: Math.min(100, Math.max(0, parseInt(document.getElementById('p-math').value) || 0)),
                phy: Math.min(100, Math.max(0, parseInt(document.getElementById('p-phy').value) || 0)),
                chem: Math.min(100, Math.max(0, parseInt(document.getElementById('p-chem').value) || 0)),
                hin_gadya: Math.min(100, Math.max(0, parseInt(document.getElementById('p-hin-gadya').value) || 0)),
                hin_padya: Math.min(100, Math.max(0, parseInt(document.getElementById('p-hin-padya').value) || 0)),
                hin_kahani: Math.min(100, Math.max(0, parseInt(document.getElementById('p-hin-kahani').value) || 0)),
                hin_natak: Math.min(100, Math.max(0, parseInt(document.getElementById('p-hin-natak').value) || 0)),
                hin_vyakaran: Math.min(100, Math.max(0, parseInt(document.getElementById('p-hin-vyakaran').value) || 0)),
                hin_sanskrit: Math.min(100, Math.max(0, parseInt(document.getElementById('p-hin-sanskrit').value) || 0)),
                eng_prose: Math.min(100, Math.max(0, parseInt(document.getElementById('p-eng-prose').value) || 0)),
                eng_poetry: Math.min(100, Math.max(0, parseInt(document.getElementById('p-eng-poetry').value) || 0)),
                eng_supp: Math.min(100, Math.max(0, parseInt(document.getElementById('p-eng-supp').value) || 0)),
                eng_grammar: Math.min(100, Math.max(0, parseInt(document.getElementById('p-eng-grammar').value) || 0))
            };
            await set(ref(db, 'public_data/status'), data);
        } else if (type === 'notice') {
            const t = document.getElementById('nt-title').value.trim();
            const m = document.getElementById('nt-desc').value.trim();
            if (!t || !m) return showToast("Sabh fields bharein", "err");
            const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            await push(ref(db, 'public_data/notices'), { title: t, msg: m, date: dateStr });
        } else if (type === 'exam') {
            const nm = document.getElementById('ex-name').value.trim();
            const sb = document.getElementById('ex-sub').value.trim();
            const dt = document.getElementById('ex-date').value;
            const tm = document.getElementById('ex-time').value;
            const mt = document.getElementById('ex-meet').value.trim();
            if (!nm || !sb || !dt) return showToast("Required fields bharein", "err");
            await push(ref(db, 'public_data/exam_schedule'), { examName: nm, subject: sb, date: dt, time: tm || 'TBA', meeting: mt || 'TBA' });
        } else if (type === 'countdown') {
            const examName = document.getElementById('cd-exam-name').value.trim();
            const d = document.getElementById('cd-date').value;
            if (!d) return;
            await set(ref(db, 'public_data/countdown'), { examName: examName || 'Final Board Exams', date: d });
        }
        showToast("Safalta se update ho gaya!", "suc");
        document.querySelectorAll('details[open] input:not([type="date"]):not([type="datetime-local"]), details[open] textarea').forEach(el => { el.value = ''; });
    } catch (e) {
        showToast("Database mein error", "err");
        console.error(e);
    }
};

// ==========================================
// COUNTDOWN
// ==========================================
setInterval(() => {
    const now = new Date();
    const diff = globalTargetDate - now;
    const daysEl = document.getElementById('count-days');
    const hoursEl = document.getElementById('count-hours');
    const minsEl = document.getElementById('count-minutes');
    if (daysEl && hoursEl && minsEl) {
        if (diff > 0) {
            daysEl.innerText = String(Math.floor(diff / 86400000)).padStart(2, '0');
            hoursEl.innerText = String(Math.floor((diff / 3600000) % 24)).padStart(2, '0');
            minsEl.innerText = String(Math.floor((diff / 60000) % 60)).padStart(2, '0');
        } else {
            daysEl.innerText = "00"; hoursEl.innerText = "00"; minsEl.innerText = "00";
        }
    }
}, 1000);

// ==========================================
// MODALS
// ==========================================
window.openExamModal = function() { const m = document.getElementById('exam-modal'); if (m) m.classList.add('active'); };
window.closeExamModal = function() { const m = document.getElementById('exam-modal'); if (m) m.classList.remove('active'); };

// Close modals on backdrop click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('celebration-modal')) {
        e.target.classList.remove('active');
    }
});

// ==========================================
// PWA INSTALL
// ==========================================
let deferredPrompt = null;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/Study12th/sw.js')
            .then(registration => { console.log('Service Worker registered:', registration.scope); })
            .catch(error => { console.warn('SW registration failed:', error); });
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.classList.remove('hidden');
});

window.installPWA = async function() {
    if (!deferredPrompt) { showToast("Install karne ka option nahi mila.", "warn"); return; }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        showToast("StudyGram Pro install ho raha hai!", "suc");
        document.getElementById('pwa-install-btn').classList.add('hidden');
    } else { showToast("Install cancel ho gaya", "inf"); }
    deferredPrompt = null;
};

if (window.matchMedia('(display-mode: standalone)').matches) {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.classList.add('hidden');
}

// ==========================================
// LOGIN
// ==========================================
const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
    loginBtn.onclick = async function() {
        if (!auth) { showToast("Auth initialized nahi hua", "err"); return; }
        const btn = document.getElementById('login-btn');
        const errorEl = document.getElementById('login-error');
        if (isLoggingIn) return;
        isLoggingIn = true;
        try {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Connecting...';
            btn.disabled = true;
            if (errorEl) errorEl.classList.add('hidden');
            await signInWithPopup(auth, provider);
            showToast("Welcome back!", "suc");
        } catch (e) {
            let errorMsg = "Login failed. Dobara koshish karein.";
            if (e.code === 'auth/popup-closed-by-user') errorMsg = "Popup band ho gaya. Dobara try karein.";
            else if (e.code === 'auth/popup-blocked') errorMsg = "Popup blocked! Popups allow karein.";
            else if (e.code === 'auth/network-request-failed') errorMsg = "Network error. Connection check karein.";
            if (errorEl) { errorEl.textContent = errorMsg; errorEl.classList.remove('hidden'); }
            showToast(errorMsg, "err");
            btn.innerHTML = '<img src="https://www.svgrepo.com/show/475656/google-color.svg" class="w-6 h-6" alt="G"> Continue with Google';
            btn.disabled = false;
        } finally { isLoggingIn = false; }
    };
}

window.logout = async function() {
    if (!auth) return;
    try {
        await signOut(auth);
        welcomeShown = false;
        isPremium = false;
        showToast("Successfully logged out!", "inf");
    } catch (e) { showToast("Logout failed", "err"); }
};

// ==========================================
// AUTH STATE
// ==========================================
if (auth) {
    onAuthStateChanged(auth, async (user) => {
        const loginScreen = document.getElementById('login-screen');
        const mainNav = document.getElementById('main-nav');
        const mainContent = document.getElementById('main-content');
        const bottomNav = document.getElementById('bottom-nav');

        if (user) {
            currentUser = user;
            const firstName = user.displayName ? user.displayName.split(' ')[0] : 'Student';
            const un = document.getElementById('user-name');
            const pn = document.getElementById('prof-name');
            if (un) un.innerText = firstName;
            if (pn) pn.innerText = user.displayName || 'Student';

            await syncUserDataFromFirebase(user.uid);

            const userData = getUserData();
            const pr = document.getElementById('prof-roll');
            if (pr) pr.innerText = userData.rollNumber;

            const photoUrl = user.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
            const ui = document.getElementById('user-img');
            const pi = document.getElementById('prof-img');
            if (ui) ui.src = photoUrl;
            if (pi) pi.src = photoUrl;

            if (db) {
                set(ref(db, 'users/' + user.uid), {
                    name: user.displayName || 'Student',
                    email: user.email,
                    photo: user.photoURL || '',
                    lastLogin: new Date().toISOString()
                });
                update(ref(db, 'users/' + user.uid), { lastActive: new Date().toISOString().split('T')[0] });
            }

            if (loginScreen) loginScreen.classList.add('fade-out');
            setTimeout(() => {
                if (loginScreen) { loginScreen.classList.add('hidden'); loginScreen.classList.remove('fade-out'); }
                if (mainNav) mainNav.classList.remove('hidden');
                if (mainContent) mainContent.classList.remove('hidden');
                if (bottomNav) bottomNav.classList.remove('hidden');
                switchTab('home');
                loadDatabaseData();
                loadAttendance();
                loadQuickNotes();
                loadDateSheet();
                loadHubPlaylist();
                initHubVisualizer();

                // Give +100 daily EXP for premium users
                if (isPremium) {
                    const today = new Date().toISOString().split('T')[0];
                    const lastDaily = localStorage.getItem('sg_lastDailyXP');
                    if (lastDaily !== today) {
                        addXP(100, 'daily_premium_bonus');
                        localStorage.setItem('sg_lastDailyXP', today);
                        showToast('+100 Daily Premium EXP!', 'suc');
                    }
                }

                updateLevelUI();
                updateBadgesUI();

                const totalFocus = parseInt(localStorage.getItem('totalFocus') || '0');
                const pf = document.getElementById('prof-focus');
                if (pf) pf.textContent = Math.floor(totalFocus / 60);
                if (!welcomeShown) setTimeout(showWelcomeModal, 800);
            }, 600);
        } else {
            currentUser = null;
            isPremium = false;
            if (loginScreen) { loginScreen.classList.remove('hidden'); loginScreen.classList.remove('fade-out'); }
            if (mainNav) mainNav.classList.add('hidden');
            if (mainContent) mainContent.classList.add('hidden');
            if (bottomNav) bottomNav.classList.add('hidden');
            const btn = document.getElementById('login-btn');
            if (btn) { btn.innerHTML = '<img src="https://www.svgrepo.com/show/475656/google-color.svg" class="w-6 h-6" alt="G"> Continue with Google'; btn.disabled = false; }
        }
    });
}

// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active, .celebration-modal.active').forEach(m => m.classList.remove('active'));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (currentUser) switchTab('ai');
    }
});

console.log('StudyGram Pro v3.0 loaded - Mohammad Arshad (@dark_eio)');


// ==========================================
// THEME TOGGLE (PREMIUM ONLY) - GLOBAL FIX
// ==========================================
window.toggleTheme = function() {
    // 1. Check if user is premium
    if (typeof checkPremiumAccess === 'function' && !checkPremiumAccess()) {
        if (typeof showPremiumPopup === 'function') showPremiumPopup();
        return;
    }

    // 2. Toggle Theme
    document.body.classList.toggle('light-mode');
    const icon = document.getElementById('theme-icon');
    
    // 3. Change Icon and Show Toast
    if (document.body.classList.contains('light-mode')) {
        if(icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
        if (typeof showToast === 'function') showToast("Light Mode Enabled!", "suc");
    } else {
        if(icon) { icon.classList.remove('fa-sun'); icon.classList.add('fa-moon'); }
        if (typeof showToast === 'function') showToast("Dark Mode Enabled!", "suc");
    }
};
