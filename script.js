// ==========================================
// STUDYGRAM PRO v4.0 - COMPLETE SCRIPT
// Nothing OS Dark Theme + Social Hub + Golden Premium
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, remove, update, get, onChildAdded } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyC-psUKqTO9u5kCuA3OUqWT63Ey0IvDei4",
    authDomain: "study-ae01d.firebaseapp.com",
    databaseURL: "https://study-ae01d-default-rtdb.firebaseio.com", // यहाँ '.com' ज़रूर चेक करना
    projectId: "study-ae01d",
    storageBucket: "study-ae01d.appspot.com",
    messagingSenderId: "596131435306", // यह आपकी पुरानी आईडी है
    appId: "1:596131435306:web:68c07e0a29829f041f66c8" // यह आपकी पुरानी ऐप आईडी है
};

let app, auth, db, storage, provider;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    storage = getStorage(app);
    provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setPersistence(auth, browserLocalPersistence);
    console.log("Firebase OK");
} catch (e) {
    console.error("Firebase Error:", e);
}

// ==========================================
// GLOBAL STATE
// ==========================================
let currentUser = null;
let isLoggingIn = false;
let isPremium = false;
let isAdminUnlocked = false;
let timerInterval = null;
let timerSeconds = 25 * 60;
let timerRunning = false;
let welcomeShown = false;
let globalTargetDate = new Date("2026-02-15T00:00:00");
let globalExamName = "Final Board Exams";
let currentNoteFilter = 'all';
let currentClassFilter = 'all';
let currentLectureFilter = 'all';
let currentSocialTab = 'stories';
let cachedNotes = [];
let cachedClasses = [];
let cachedLectures = [];
let cachedPosts = [];
let cachedStories = [];
let cachedReels = [];
let storyViewerInterval = null;
let isSavingName = false;
let grantedPremiumUids = new Set();

// Music state
let isPlaying = false;
let playlistMode = false;
let visualizerInterval = null;
let youtubePlayer = null;
let currentVideoDuration = 0;
let currentVideoTime = 0;
let seekbarInterval = null;
let currentVideoId = '';
let currentVideoTitle = 'YouTube Audio';
let musicTotalListened = 0;
let musicEarnedXP = 0;
let musicXPInterval = null;

// ==========================================
// CONSTANTS
// ==========================================
const MAX_LEVEL = 100;
const TARGET_TOTAL_XP = 1000000;
const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;
const REELS_SEEN_KEY = 'sg_seen_reels';
const BANNED_USERS_KEY = 'sg_banned_users';
const ADMIN_PASS = "unlock";

// ==========================================
// HAPTIC FEEDBACK
// ==========================================
window.haptic = function(pattern) {
    if (navigator.vibrate) {
        navigator.vibrate(pattern || 15);
    }
};

// ==========================================
// SKELETON LOADER
// ==========================================
function showSkeleton() {
    const loader = document.getElementById('skeleton-loader');
    if (loader) loader.classList.remove('loaded');
}
function hideSkeleton() {
    const loader = document.getElementById('skeleton-loader');
    if (loader) {
        loader.classList.add('loaded');
        setTimeout(() => { if (loader) loader.style.display = 'none'; }, 500);
    }
}

// ==========================================
// LEVEL SYSTEM
// ==========================================
function cumulativeXP(level) {
    if (level <= 1) return 0;
    if (level > MAX_LEVEL + 1) return TARGET_TOTAL_XP;
    const t = (level - 1) / 99;
    return Math.round(TARGET_TOTAL_XP * Math.pow(t, 1.8));
}
function levelXPRequired(level) {
    return cumulativeXP(level + 1) - cumulativeXP(level);
}
function calculateLevel(totalXP) {
    if (totalXP <= 0) return { level: 1, xpIntoLevel: 0, xpForNext: levelXPRequired(1), progress: 0, totalXP: 0 };
    let low = 1, high = MAX_LEVEL, ans = 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (totalXP >= cumulativeXP(mid)) { ans = mid; low = mid + 1; }
        else { high = mid - 1; }
    }
    const level = Math.min(ans, MAX_LEVEL);
    const cumulBefore = cumulativeXP(level);
    const cumulNext = cumulativeXP(level + 1);
    const xpInto = totalXP - cumulBefore;
    const xpNeeded = cumulNext - cumulBefore;
    const progress = xpNeeded > 0 ? Math.min(100, (xpInto / xpNeeded) * 100) : 100;
    return { level, xpIntoLevel: xpInto, xpForNext: xpNeeded, progress, totalXP };
}

// ==========================================
// USER DATA
// ==========================================
function getUserData() {
    const uid = currentUser?.uid;
    if (!uid) return { level: 1, xp: 0, totalXp: 0, badges: [], rollNumber: 'UP' + Math.floor(100000 + Math.random() * 900000), displayName: '', hasClaimedNameExp: false };
    const saved = JSON.parse(localStorage.getItem('sg_user_' + uid) || '{}');
    return {
        level: saved.level || 1,
        xp: saved.xp || 0,
        totalXp: saved.totalXp || 0,
        badges: saved.badges || [],
        rollNumber: saved.rollNumber || 'UP' + Math.floor(100000 + Math.random() * 900000),
        displayName: saved.displayName || currentUser?.displayName || 'Student',
        hasClaimedNameExp: saved.hasClaimedNameExp || false
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
            const merged = {
                level: stats.level || localData.level || 1,
                xp: stats.xp !== undefined ? stats.xp : (localData.xp || 0),
                totalXp: stats.totalXp !== undefined ? stats.totalXp : (localData.totalXp || 0),
                badges: stats.badges || localData.badges || [],
                rollNumber: localData.rollNumber || 'UP' + Math.floor(100000 + Math.random() * 900000),
                displayName: localData.displayName || currentUser?.displayName || 'Student',
                hasClaimedNameExp: stats.hasClaimedNameExp || localData.hasClaimedNameExp || false
            };
            localStorage.setItem('sg_user_' + uid, JSON.stringify(merged));
        }
        const premSnap = await get(ref(db, 'users/' + uid + '/isPremium'));
        if (premSnap.exists() && premSnap.val() === true) {
            isPremium = true;
            localStorage.setItem('sg_premium_' + uid, '1');
        } else {
            isPremium = localStorage.getItem('sg_premium_' + uid) === '1';
        }
        document.body.classList.toggle('premium-active', isPremium);
    } catch (e) {
        isPremium = localStorage.getItem('sg_premium_' + uid) === '1';
        document.body.classList.toggle('premium-active', isPremium);
    }
}

function addXP(amount, reason) {
    const uid = currentUser?.uid;
    if (!uid) return;
    let data = getUserData();
    const oldLevel = data.level;
    data.totalXp = (data.totalXp || 0) + amount;
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
        set(ref(db, 'users/' + uid + '/stats'), { level: data.level, xp: data.xp, totalXp: data.totalXp, badges: data.badges, hasClaimedNameExp: data.hasClaimedNameExp });
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
    const ptx = document.getElementById('prof-total-xp');
    if (ptx) ptx.textContent = data.totalXp.toLocaleString();
    const pb = document.getElementById('premium-badge');
    if (pb) pb.classList.toggle('hidden', !isPremium);
    const mpb = document.getElementById('music-premium-badge');
    if (mpb) mpb.classList.toggle('hidden', !isPremium);
    const sml = document.getElementById('sidebar-music-lock');
    if (sml) sml.innerHTML = isPremium ? '' : '<i class="fa-solid fa-lock"></i>';
}

function updateBadgesUI() {
    const data = getUserData();
    const colors = {
        indigo: 'border-indigo-400 text-indigo-300 bg-indigo-500/10',
        green: 'border-green-400 text-green-300 bg-green-500/10',
        amber: 'border-amber-400 text-amber-300 bg-amber-500/10',
        red: 'border-red-400 text-red-300 bg-red-500/10',
        purple: 'border-purple-400 text-purple-300 bg-purple-500/10',
        blue: 'border-blue-400 text-blue-300 bg-blue-500/10'
    };
    const pb = document.getElementById('prof-badges');
    if (pb) {
        if (data.badges.length === 0) {
            pb.innerHTML = '<span class="text-muted">No badges yet - tap to see all</span>';
        } else {
            let h = '';
            data.badges.slice(0, 6).forEach(b => {
                const c = colors[b.color] || colors.indigo;
                h += '<span class="badge-pill ' + c + '"><i class="fa-solid fa-medal"></i> ' + b.name + '</span>';
            });
            if (data.badges.length > 6) h += '<span class="badge-pill border-gray-600 text-gray-500 bg-gray-500/10">+' + (data.badges.length - 6) + ' more</span>';
            pb.innerHTML = h;
        }
    }
}

// ==========================================
// PREMIUM SYSTEM
// ==========================================
function checkPremiumAccess() { return isPremium === true; }

window.attemptAccessMusic = function() {
    if (checkPremiumAccess()) switchTab('music');
    else { haptic(); showPremiumPopup(); }
};

window.showPremiumPopup = function() {
    const m = document.getElementById('premium-modal');
    if (m) m.classList.add('active');
};
window.closePremiumPopup = function() {
    const m = document.getElementById('premium-modal');
    if (m) m.classList.remove('active');
};

// Grant Premium with duplicate prevention
window.grantPremium = async function() {
    const uidInput = document.getElementById('premium-uid');
    if (!uidInput || !uidInput.value.trim()) { showToast("Enter a UID", "err"); return; }
    const targetUid = uidInput.value.trim();
    if (!db) { showToast("Database not connected", "err"); return; }

    // Check if already premium
    try {
        const snap = await get(ref(db, 'users/' + targetUid + '/isPremium'));
        if (snap.exists() && snap.val() === true) {
            showToast("User already has Premium!", "warn");
            return;
        }
    } catch (e) {}

    // Disable button
    const btn = document.getElementById('grant-premium-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Granting...'; }

    try {
        await set(ref(db, 'users/' + targetUid + '/isPremium'), true);
        const statsSnap = await get(ref(db, 'users/' + targetUid + '/stats'));
        let stats = statsSnap.exists() ? statsSnap.val() : { level: 1, xp: 0, totalXp: 0, badges: [] };
        const newLevel = Math.min(100, (stats.level || 1) + 10);
        const newCumul = cumulativeXP(newLevel);
        stats.totalXp = Math.max(stats.totalXp || 0, newCumul);
        const recalc = calculateLevel(stats.totalXp);
        stats.level = recalc.level;
        stats.xp = recalc.xpIntoLevel;
        if (!stats.badges) stats.badges = [];
        if (!stats.badges.find(b => b.id === 'premium')) {
            stats.badges.push({ id: 'premium', name: 'Premium User', color: 'amber', earned: new Date().toISOString() });
        }
        await set(ref(db, 'users/' + targetUid + '/stats'), stats);
        showToast("Premium granted to " + targetUid.substring(0, 8) + "...!", "suc");
        uidInput.value = '';
    } catch (e) {
        showToast("Failed: " + e.message, "err");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-crown"></i> Grant Premium'; }
    }
};

// Revoke Premium
window.revokePremium = async function() {
    const uidInput = document.getElementById('premium-uid');
    if (!uidInput || !uidInput.value.trim()) { showToast("Enter a UID", "err"); return; }
    const targetUid = uidInput.value.trim();
    if (!db) { showToast("Database not connected", "err"); return; }
    if (!confirm("Are you sure you want to revoke Premium from this user?")) return;
    try {
        await set(ref(db, 'users/' + targetUid + '/isPremium'), false);
        localStorage.removeItem('sg_premium_' + targetUid);
        showToast("Premium revoked from " + targetUid.substring(0, 8) + "...", "suc");
        uidInput.value = '';
    } catch (e) {
        showToast("Failed: " + e.message, "err");
    }
};

// ==========================================
// SIDEBAR
// ==========================================
window.openSidebar = function() {
    document.getElementById('sidebar')?.classList.add('active');
    document.getElementById('sidebar-overlay')?.classList.add('active');
};
window.closeSidebar = function() {
    document.getElementById('sidebar')?.classList.remove('active');
    document.getElementById('sidebar-overlay')?.classList.remove('active');
};

// ==========================================
// TAB SWITCHING
// ==========================================
window.switchTab = function(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active-section'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active-section');

    const navTop = document.getElementById('main-nav');
    const navBot = document.getElementById('bottom-nav');

    if (id === 'music' || id === 'social') {
        if (navBot) navBot.style.display = 'none';
    } else {
        if (navBot) navBot.style.display = 'flex';
    }

    if (navTop) {
        if (id === 'home') { navTop.classList.remove('hidden'); navTop.style.display = 'flex'; }
        else { navTop.classList.add('hidden'); navTop.style.display = 'none'; }
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        const isActive = btn.dataset.target === id;
        btn.classList.toggle('active', isActive);
    });

    // Premium lock on video lectures
    if (id === 'lectures') {
        updateLecturesUI();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ==========================================
// VIDEO LECTURES (PREMIUM LOCKED)
// ==========================================
function updateLecturesUI() {
    const banner = document.getElementById('lectures-premium-banner');
    const list = document.getElementById('lectures-list');
    if (!banner || !list) return;
    if (isPremium) {
        banner.classList.add('hidden');
        list.classList.remove('hidden');
    } else {
        banner.classList.remove('hidden');
        list.classList.add('hidden');
    }
}

window.filterLectures = function(category) {
    currentLectureFilter = category;
    renderLecturesList();
};

function renderLecturesList() {
    const container = document.getElementById('lectures-items');
    if (!container) return;
    let filtered = cachedLectures;
    if (currentLectureFilter !== 'all') {
        filtered = cachedLectures.filter(l => (l.category || '').toLowerCase() === currentLectureFilter);
    }
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-graduation-cap empty-icon"></i>No lectures available.</div>';
        return;
    }
    container.innerHTML = filtered.map(item => {
        const catColors = {
            physics: '#6366f1', chemistry: '#34c759', math: '#10b981',
            hindi: '#f97316', english: '#3b82f6', other: '#8e8e93'
        };
        const color = catColors[(item.category || '').toLowerCase()] || '#6366f1';
        const videoId = item.link ? extractVideoId(item.link) : '';
        const thumb = videoId ? 'https://img.youtube.com/vi/' + videoId + '/mqdefault.jpg' : '';
        return '<div class="lecture-card">' +
            (thumb ? '<img src="' + thumb + '" class="lecture-thumb" alt="">' : '') +
            '<div class="lecture-body">' +
                '<span class="lecture-premium-tag"><i class="fa-solid fa-crown"></i> Video Lectures Access!</span>' +
                '<span class="lecture-subject" style="color:' + color + '">' + (item.category || 'Other').charAt(0).toUpperCase() + (item.category || '').slice(1) + '</span>' +
                '<h4 class="lecture-chapter">' + (item.chapter || item.topic || 'Untitled') + '</h4>' +
                '<span class="lecture-date">Subject: ' + (item.subject || item.category || 'General') + ' &bull; Uploaded: ' + (item.date || 'Recently') + '</span>' +
                (item.link ? '<a href="' + item.link + '" target="_blank" class="note-btn" style="margin-top:10px;"><i class="fa-solid fa-play"></i> Watch Lecture</a>' : '') +
            '</div></div>';
    }).join('');
}

// ==========================================
// SOCIAL HUB
// ==========================================
window.switchSocialTab = function(tab) {
    currentSocialTab = tab;
    document.querySelectorAll('.social-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.social-panel').forEach(p => p.classList.toggle('active', p.id === 'social-' + tab));
    if (tab === 'stories') renderStories();
    if (tab === 'feed') renderFeed();
    if (tab === 'reels') renderReels();
};

// --- STORIES ---
function getActiveStories() {
    const now = Date.now();
    return cachedStories.filter(s => (now - (s.timestamp || 0)) < STORY_LIFETIME_MS);
}

function renderStories() {
    const row = document.getElementById('stories-row');
    const list = document.getElementById('stories-list');
    const active = getActiveStories();

    // Update add story avatar
    const userAvatar = document.getElementById('story-user-avatar');
    if (userAvatar && currentUser) userAvatar.src = currentUser.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

    // Render other users' stories in horizontal row
    let storyItems = '';
    const uniqueUsers = {};
    active.forEach(s => {
        if (!uniqueUsers[s.userId]) uniqueUsers[s.userId] = s;
    });
    Object.values(uniqueUsers).forEach(s => {
        storyItems += '<div class="story-item" onclick="haptic(); viewStory(\'' + s.key + '\');">' +
            '<div class="story-ring">' +
                '<img src="' + (s.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png') + '" class="story-avatar" alt="">' +
            '</div>' +
            '<span class="story-username">' + escapeHtml(s.userName || 'User') + '</span>' +
        '</div>';
    });
    // Insert after the "Your Story" item
    const yourStory = row.querySelector('.story-add');
    if (yourStory) {
        row.innerHTML = '';
        row.appendChild(yourStory);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = storyItems;
        while (tempDiv.firstChild) row.appendChild(tempDiv.firstChild);
    }

    // Detailed list below
    if (list) {
        if (active.length === 0) {
            list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch empty-icon"></i>No active stories. Add one!</div>';
        } else {
            list.innerHTML = active.slice(0, 20).map(s => {
                const age = Math.round((Date.now() - (s.timestamp || 0)) / 3600000);
                const ageText = age < 1 ? 'Just now' : age + 'h ago';
                return '<div class="post-card" style="margin-bottom:12px;">' +
                    '<div class="post-header">' +
                        '<img src="' + (s.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png') + '" class="post-avatar" alt="">' +
                        '<div class="post-user-info"><span class="post-username">' + escapeHtml(s.userName || 'User') + '</span><span class="post-time">' + ageText + '</span></div>' +
                    '</div>' +
                    '<div class="post-body">' +
                        (s.text ? '<p class="post-caption">' + escapeHtml(s.text) + '</p>' : '') +
                        (s.mediaUrl ? (s.type === 'video' ? '<video src="' + s.mediaUrl + '" controls style="width:100%;border-radius:12px;margin-top:8px;"></video>' : '<img src="' + s.mediaUrl + '" style="width:100%;border-radius:12px;margin-top:8px;" alt="">') : '') +
                    '</div>' +
                '</div>';
            }).join('');
        }
    }
}

window.openCreateStoryModal = function() {
    const m = document.getElementById('create-story-modal');
    if (m) m.classList.add('active');
};
window.closeCreateStoryModal = function() {
    document.getElementById('create-story-modal')?.classList.remove('active');
};
window.toggleStoryInputs = function() {
    const type = document.getElementById('story-type')?.value;
    const textInput = document.getElementById('story-text');
    const mediaInput = document.getElementById('story-media');
    if (textInput) textInput.classList.toggle('hidden', type === 'video' || type === 'image');
    if (mediaInput) { mediaInput.classList.remove('hidden'); mediaInput.placeholder = type === 'video' ? 'Video URL...' : 'Image URL...'; }
};

window.createStory = async function() {
    if (!currentUser) { showToast("Login required!", "err"); return; }
    const type = document.getElementById('story-type')?.value || 'text';
    const text = document.getElementById('story-text')?.value.trim() || '';
    const media = document.getElementById('story-media')?.value.trim() || '';
    if (type === 'text' && !text) { showToast("Enter some text!", "err"); return; }
    if ((type === 'image' || type === 'video') && !media) { showToast("Enter a media URL!", "err"); return; }
    if (!db) return;
    try {
        await push(ref(db, 'social/stories'), {
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Student',
            userPhoto: currentUser.photoURL || '',
            type, text, mediaUrl: media,
            timestamp: Date.now()
        });
        showToast("Story added!", "suc");
        closeCreateStoryModal();
        document.getElementById('story-text').value = '';
        document.getElementById('story-media').value = '';
    } catch (e) { showToast("Failed: " + e.message, "err"); }
};

window.viewStory = function(storyKey) {
    const story = cachedStories.find(s => s.key === storyKey);
    if (!story) return;
    const modal = document.getElementById('view-story-modal');
    const avatar = document.getElementById('viewer-avatar');
    const username = document.getElementById('viewer-username');
    const time = document.getElementById('viewer-time');
    const body = document.getElementById('viewer-body');
    const bar = document.getElementById('viewer-bar');
    if (!modal || !body) return;

    if (avatar) avatar.src = story.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    if (username) username.textContent = story.userName || 'User';
    const age = Math.round((Date.now() - (story.timestamp || 0)) / 3600000);
    if (time) time.textContent = age < 1 ? 'Just now' : age + 'h ago';

    let content = '';
    if (story.type === 'text') content = '<p>' + escapeHtml(story.text || '') + '</p>';
    else if (story.type === 'image') content = '<img src="' + story.mediaUrl + '" alt="">';
    else if (story.type === 'video') content = '<video src="' + story.mediaUrl + '" controls autoplay></video>';
    body.innerHTML = content;

    modal.classList.add('active');
    if (bar) bar.style.width = '0%';
    let progress = 0;
    if (storyViewerInterval) clearInterval(storyViewerInterval);
    storyViewerInterval = setInterval(() => {
        progress += 2;
        if (bar) bar.style.width = progress + '%';
        if (progress >= 100) { closeViewStory(); }
    }, 100);
};
window.closeViewStory = function() {
    document.getElementById('view-story-modal')?.classList.remove('active');
    if (storyViewerInterval) { clearInterval(storyViewerInterval); storyViewerInterval = null; }
};

// --- FEED ---
function renderFeed() {
    const list = document.getElementById('feed-list');
    if (!list) return;
    if (cachedPosts.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-image empty-icon"></i>No posts yet. Be the first to share!</div>';
        return;
    }
    list.innerHTML = cachedPosts.slice().reverse().map(p => {
        const age = getTimeAgo(p.timestamp);
        const liked = p.likes && currentUser && p.likes[currentUser.uid];
        return '<div class="post-card">' +
            '<div class="post-header">' +
                '<img src="' + (p.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png') + '" class="post-avatar" alt="">' +
                '<div class="post-user-info"><span class="post-username">' + escapeHtml(p.userName || 'User') + '</span><span class="post-time">' + age + '</span></div>' +
            '</div>' +
            (p.imageUrl ? '<img src="' + p.imageUrl + '" class="post-image" alt="">' : '') +
            '<div class="post-body">' +
                '<p class="post-caption">' + escapeHtml(p.caption || '') + '</p>' +
            '</div>' +
            '<div class="post-actions">' +
                '<button class="post-action ' + (liked ? 'liked' : '') + '" onclick="haptic(); toggleLikePost(\'' + p.key + '\');">' +
                    '<i class="fa-' + (liked ? 'solid' : 'regular') + ' fa-heart"></i> ' + (p.likes ? Object.keys(p.likes).length : 0) +
                '</button>' +
                '<button class="post-action" onclick="haptic(); sharePost(\'' + p.key + '\');"><i class="fa-solid fa-share"></i> Share</button>' +
                '<button class="post-action" onclick="haptic(); followUser(\'' + p.userId + '\');"><i class="fa-solid fa-user-plus"></i> Follow</button>' +
            '</div>' +
        '</div>';
    }).join('');
}

window.openCreatePostModal = function() {
    const m = document.getElementById('create-post-modal');
    if (m) m.classList.add('active');
};
window.closeCreatePostModal = function() {
    document.getElementById('create-post-modal')?.classList.remove('active');
};

window.createPost = async function() {
    if (!currentUser) { showToast("Login required!", "err"); return; }
    const caption = document.getElementById('post-caption')?.value.trim() || '';
    const image = document.getElementById('post-image')?.value.trim() || '';
    if (!caption && !image) { showToast("Add a caption or image!", "err"); return; }
    if (!db) return;
    try {
        await push(ref(db, 'social/posts'), {
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Student',
            userPhoto: currentUser.photoURL || '',
            caption, imageUrl: image,
            timestamp: Date.now(),
            likes: {}
        });
        showToast("Post created!", "suc");
        closeCreatePostModal();
        document.getElementById('post-caption').value = '';
        document.getElementById('post-image').value = '';
    } catch (e) { showToast("Failed: " + e.message, "err"); }
};

window.toggleLikePost = async function(postKey) {
    if (!currentUser || !db) { showToast("Login required!", "err"); return; }
    try {
        const likeRef = ref(db, 'social/posts/' + postKey + '/likes/' + currentUser.uid);
        const snap = await get(likeRef);
        if (snap.exists()) { await remove(likeRef); }
        else { await set(likeRef, true); addXP(2, 'like_post'); }
    } catch (e) { console.error(e); }
};

window.sharePost = async function(postKey) {
    const post = cachedPosts.find(p => p.key === postKey);
    if (!post) return;
    try {
        if (navigator.share) {
            await navigator.share({ title: 'StudyGram Pro', text: post.caption || 'Check this out!' });
        } else {
            await navigator.clipboard.writeText(post.caption || 'Check this out on StudyGram Pro!');
            showToast("Copied to clipboard!", "suc");
        }
    } catch (e) {}
};

window.followUser = async function(userId) {
    if (!currentUser || !db) return;
    try {
        await set(ref(db, 'social/follows/' + currentUser.uid + '/' + userId), true);
        showToast("Following user!", "suc");
        addXP(5, 'follow_user');
    } catch (e) { showToast("Failed: " + e.message, "err"); }
};

// --- REELS with seen history ---
function getSeenReels() {
    try { return JSON.parse(localStorage.getItem(REELS_SEEN_KEY) || '[]'); }
    catch (e) { return []; }
}
function markReelSeen(reelId) {
    const seen = getSeenReels();
    if (!seen.includes(reelId)) {
        seen.push(reelId);
        try { localStorage.setItem(REELS_SEEN_KEY, JSON.stringify(seen)); } catch (e) {}
    }
}

function renderReels() {
    const container = document.getElementById('reels-container');
    if (!container) return;
    const seen = getSeenReels();
    const unseen = cachedReels.filter(r => !seen.includes(r.key));

    if (unseen.length === 0 && cachedReels.length > 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-check-circle empty-icon" style="color:#34c759"></i>You\'ve seen all reels! Check back later for new ones.</div>';
        return;
    }
    if (cachedReels.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-film empty-icon"></i>No reels yet. Upload one!</div>';
        return;
    }

    container.innerHTML = unseen.map(r => {
        return '<div class="reel-card" data-reel-id="' + r.key + '">' +
            '<div class="reel-video-wrap">' +
                '<video class="reel-video" src="' + r.videoUrl + '" loop playsinline muted onclick="this.muted=!this.muted;"></video>' +
                '<div class="reel-overlay">' +
                    '<div class="reel-user">' +
                        '<img src="' + (r.userPhoto || 'https://cdn-icons-png.flaticon.com/512/149/149071.png') + '" class="reel-user-avatar" alt="">' +
                        '<span class="reel-username">' + escapeHtml(r.userName || 'User') + '</span>' +
                    '</div>' +
                    '<p class="reel-caption">' + escapeHtml(r.caption || '') + '</p>' +
                    '<div class="reel-actions">' +
                        '<button class="reel-action" onclick="haptic(); likeReel(\'' + r.key + '\');"><i class="fa-solid fa-heart"></i> ' + (r.likes || 0) + '</button>' +
                        '<button class="reel-action" onclick="haptic(); shareReel(\'' + r.key + '\');"><i class="fa-solid fa-share"></i> Share</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }).join('');

    // Mark as seen when scrolled into view
    setupReelObserver();
}

function setupReelObserver() {
    if (!window.IntersectionObserver) return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target.querySelector('video');
            if (entry.isIntersecting) {
                video?.play();
                const reelId = entry.target.dataset.reelId;
                if (reelId) markReelSeen(reelId);
            } else {
                video?.pause();
            }
        });
    }, { threshold: 0.6 });
    document.querySelectorAll('.reel-card').forEach(card => observer.observe(card));
}

window.likeReel = async function(reelKey) {
    if (!currentUser || !db) return;
    try {
        const likeRef = ref(db, 'social/reels/' + reelKey + '/likes/' + currentUser.uid);
        const snap = await get(likeRef);
        if (snap.exists()) { await remove(likeRef); }
        else { await set(likeRef, true); addXP(3, 'like_reel'); }
    } catch (e) {}
};

window.shareReel = async function(reelKey) {
    const reel = cachedReels.find(r => r.key === reelKey);
    if (!reel) return;
    try {
        if (navigator.share) { await navigator.share({ title: 'StudyGram Reel', text: reel.caption || 'Check this reel!' }); }
        else { showToast("Reel link copied!", "suc"); }
    } catch (e) {}
};

function getTimeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
}

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
        message.textContent = 'Badhai ho! Aap naye level par pahunche hain!';
        icon.innerHTML = '<i class="fa-solid fa-arrow-up-right-dots"></i>';
    } else {
        title.textContent = 'Badge Earned!';
        subtitle.textContent = value;
        message.textContent = 'Shandar! Aapne ek naya badge hasil kiya hai!';
        icon.innerHTML = '<i class="fa-solid fa-medal"></i>';
    }
    modal.classList.add('active');
    launchConfetti();
};
window.closeCelebrationModal = function() {
    document.getElementById('celebration-modal')?.classList.remove('active');
    document.getElementById('confetti-container').innerHTML = '';
};
function launchConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) return;
    container.innerHTML = '';
    const colors = ['#FFD700', '#DAA520', '#818cf8', '#c084fc', '#ff6b35', '#34c759', '#ff3b30', '#f59e0b'];
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
    "Safalta mehnat se milti hai, kismat se nahi.",
    "Padhai aaj ka kaam hai, kal ka sapna nahi.",
    "Girte hain shahsawar hi maidan-e-jung mein!",
    "Sapne dekhna achha hai, lekin un sapnon ko poora karne ke liye jagna zaroori hai!",
    "Bada socho, mehnat karo, hasil karo!",
    "Asafalta ek chunauti hai, sweekaro!",
    "Ek kadam chhota ho sakta hai, lekin har kadam ek nayi shuruaat hai!",
    "Gyan woh hathiyar hai jo koi cheen nahi sakta!"
];

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
    quoteEl.textContent = hindiQuotes[Math.floor(Math.random() * hindiQuotes.length)];
    modal.classList.add('active');
}
window.closeWelcomeModal = function() {
    document.getElementById('welcome-modal')?.classList.remove('active');
};

// ==========================================
// PROFILE FUNCTIONS (BUG FIX: EXP EXPLOIT)
// ==========================================
window.handleProfilePicUpload = async function(event) {
    const file = event.target.files[0];
    if (!file || !currentUser || !storage) { showToast("Login required!", "err"); return; }
    if (file.size > 5 * 1024 * 1024) { showToast("Max 5MB", "err"); return; }
    showToast("Uploading...", "inf");
    try {
        const sRef = storageRef(storage, 'profile_pics/' + currentUser.uid + '.jpg');
        await uploadBytes(sRef, file);
        const url = await getDownloadURL(sRef);
        await updateProfile(auth.currentUser, { photoURL: url });
        document.getElementById('user-img').src = url;
        document.getElementById('prof-img').src = url;
        await set(ref(db, 'users/' + currentUser.uid + '/photo'), url);
        showToast("Profile picture updated!", "suc");
        addXP(15, 'profile_update');
    } catch (e) { showToast("Upload failed: " + e.message, "err"); }
};

window.toggleNameEdit = function() {
    document.getElementById('name-edit-box')?.classList.toggle('hidden');
};

window.saveDisplayName = async function() {
    // CRITICAL BUG FIX: Debounce + hasClaimedNameExp check
    if (isSavingName) { showToast("Please wait...", "warn"); return; }
    const input = document.getElementById('name-edit-input');
    if (!input || !input.value.trim()) return;
    if (!auth.currentUser) { showToast("Login required!", "err"); return; }

    let data = getUserData();
    // Only give EXP once per user for name change
    const shouldGiveXP = !data.hasClaimedNameExp;

    isSavingName = true;
    const btn = document.getElementById('save-name-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

    try {
        const newName = input.value.trim();
        await updateProfile(auth.currentUser, { displayName: newName });
        document.getElementById('user-name').innerText = newName.split(' ')[0];
        document.getElementById('prof-name').innerText = newName;
        data.displayName = newName;
        if (shouldGiveXP) {
            data.hasClaimedNameExp = true;
            addXP(10, 'name_update');
        }
        saveUserData(data);
        if (db && currentUser) {
            await set(ref(db, 'users/' + currentUser.uid + '/name'), newName);
            await update(ref(db, 'users/' + currentUser.uid + '/stats'), { hasClaimedNameExp: true });
        }
        toggleNameEdit();
        input.value = '';
        showToast("Name updated!" + (shouldGiveXP ? " +10 EXP" : ""), "suc");
    } catch (e) {
        showToast("Failed: " + e.message, "err");
    } finally {
        isSavingName = false;
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i>'; }
    }
};

window.editRollNumber = function() {
    const data = getUserData();
    const ri = document.getElementById('roll-input');
    if (ri) ri.value = data.rollNumber || '';
    document.getElementById('roll-modal')?.classList.add('active');
};
window.closeRollModal = function() { document.getElementById('roll-modal')?.classList.remove('active'); };
window.saveRollNumber = function() {
    const ri = document.getElementById('roll-input');
    if (!ri || !ri.value.trim()) return;
    let data = getUserData();
    data.rollNumber = ri.value.trim();
    saveUserData(data);
    document.getElementById('prof-roll').textContent = data.rollNumber;
    closeRollModal();
    showToast("Roll Number saved!", "suc");
};

window.showBadgePopup = function() {
    const data = getUserData();
    const list = document.getElementById('badge-popup-list');
    const modal = document.getElementById('badge-popup-modal');
    if (!list || !modal) return;
    const colors = {
        indigo: 'border-indigo-400 text-indigo-300 bg-indigo-500/10',
        green: 'border-green-400 text-green-300 bg-green-500/10',
        amber: 'border-amber-400 text-amber-300 bg-amber-500/10',
        red: 'border-red-400 text-red-300 bg-red-500/10',
        purple: 'border-purple-400 text-purple-300 bg-purple-500/10',
        blue: 'border-blue-400 text-blue-300 bg-blue-500/10'
    };
    if (data.badges.length === 0) {
        list.innerHTML = '<div class="text-muted" style="text-align:center;padding:20px;">No badges earned yet. Keep studying!</div>';
    } else {
        list.innerHTML = data.badges.map(b => {
            const c = colors[b.color] || colors.indigo;
            const date = b.earned ? new Date(b.earned).toLocaleDateString() : 'Recently';
            return '<div class="admin-user-item"><span class="badge-pill ' + c + '"><i class="fa-solid fa-medal"></i> ' + b.name + '</span><span class="text-muted" style="margin-left:auto;">' + date + '</span></div>';
        }).join('');
    }
    modal.classList.add('active');
};
window.closeBadgePopup = function() { document.getElementById('badge-popup-modal')?.classList.remove('active'); };

window.showDeveloperModal = function() { document.getElementById('developer-modal')?.classList.add('active'); };
window.closeDeveloperModal = function() { document.getElementById('developer-modal')?.classList.remove('active'); };

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
    {text: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs"}
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
// TOAST
// ==========================================
window.showToast = function(msg, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'inf');
    let icon = type === 'err' ? 'fa-triangle-exclamation' : type === 'suc' ? 'fa-check-circle' : type === 'warn' ? 'fa-exclamation-circle' : 'fa-info-circle';
    t.innerHTML = '<i class="fa-solid ' + icon + ' flex-shrink-0"></i><span>' + msg + '</span>';
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
};

// ==========================================
// ATTENDANCE
// ==========================================
function loadAttendance() {
    const today = new Date().toISOString().split('T')[0];
    const saved = JSON.parse(localStorage.getItem('attendance') || '{}');
    const streak = parseInt(localStorage.getItem('streak') || '0');
    document.getElementById('streak-count').textContent = streak;
    document.getElementById('prof-streak').textContent = streak;
    const btn = document.getElementById('att-btn');
    if (saved[today] && btn) { btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Marked!'; btn.disabled = true; btn.classList.add('opacity-50'); }
    const totalDays = Object.keys(saved).length;
    const daysPassed = new Date().getDate();
    const rate = daysPassed > 0 ? Math.round((totalDays / daysPassed) * 100) : 0;
    document.getElementById('attendance-rate').textContent = rate + '%';
    document.getElementById('prof-attendance').textContent = rate + '%';
    renderAttendanceCalendar(saved);
}
function renderAttendanceCalendar(saved) {
    const cal = document.getElementById('attendance-calendar');
    if (!cal) return;
    const today = new Date();
    const year = today.getFullYear(), month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    let html = '';
    ['S','M','T','W','T','F','S'].forEach(d => { html += '<div style="text-align:center;font-size:9px;font-weight:700;color:#444;margin-bottom:2px;">' + d + '</div>'; });
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
    if (saved[today]) { showToast("Already marked!", "inf"); return; }
    saved[today] = true;
    if (lastDate) {
        const diff = Math.floor((new Date() - new Date(lastDate)) / 86400000);
        if (diff === 1) streak++;
        else if (diff > 1) streak = 1;
    } else streak = 1;
    localStorage.setItem('attendance', JSON.stringify(saved));
    localStorage.setItem('streak', streak.toString());
    localStorage.setItem('lastAttendance', today);
    document.getElementById('streak-count').textContent = streak;
    document.getElementById('prof-streak').textContent = streak;
    const btn = document.getElementById('att-btn');
    if (btn) { btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Marked!'; btn.disabled = true; btn.classList.add('opacity-50'); }
    renderAttendanceCalendar(saved);
    showToast("Streak: " + streak + " days!", "suc");
    addXP(10, 'attendance');
    if (streak >= 7) addBadge('streak_7', '7 Day Streak', 'amber');
    if (streak >= 30) addBadge('streak_30', '30 Day Streak', 'red');
};

// ==========================================
// TIMER
// ==========================================
window.startTimer = function() {
    if (timerRunning) return;
    timerRunning = true;
    document.getElementById('timer-start')?.classList.add('hidden');
    document.getElementById('timer-pause')?.classList.remove('hidden');
    timerInterval = setInterval(() => {
        if (timerSeconds > 0) { timerSeconds--; updateTimerDisplay(); }
        else {
            pauseTimer();
            showToast("Focus session complete!", "suc");
            const totalFocus = parseInt(localStorage.getItem('totalFocus') || '0') + 25;
            localStorage.setItem('totalFocus', totalFocus);
            document.getElementById('prof-focus').textContent = Math.floor(totalFocus / 60);
            addXP(15, 'focus_timer');
            addBadge('focus_first', 'Focus Master', 'green');
        }
    }, 1000);
};
window.pauseTimer = function() {
    timerRunning = false;
    clearInterval(timerInterval);
    document.getElementById('timer-start')?.classList.remove('hidden');
    document.getElementById('timer-pause')?.classList.add('hidden');
};
window.resetTimer = function() { pauseTimer(); timerSeconds = 25 * 60; updateTimerDisplay(); };
function updateTimerDisplay() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    document.getElementById('timer-display').textContent = String(mins).padStart(2,'0') + ':' + String(secs).padStart(2,'0');
    document.getElementById('timer-circle')?.style.setProperty('--p', ((25*60 - timerSeconds)/(25*60))*100 + '%');
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
    if (notes.length === 0) { list.innerHTML = '<div class="text-muted" style="text-align:center;padding:8px;">No notes yet</div>'; return; }
    list.innerHTML = notes.map((note, i) =>
        '<div class="quick-note-item"><span class="quick-note-text">' + escapeHtml(note) + '</span><button onclick="haptic(); deleteQuickNote(' + i + ');" class="btn-text" style="margin:0;color:#ff3b30;flex-shrink:0;"><i class="fa-solid fa-times"></i></button></div>'
    ).join('');
}
window.addQuickNote = function() {
    const input = document.getElementById('quick-note-input');
    if (!input || !input.value.trim()) return;
    const notes = JSON.parse(localStorage.getItem('quickNotes') || '[]');
    notes.unshift(input.value.trim());
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
    document.querySelectorAll('.cat-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.cat === category));
    renderNotesList();
};
function renderNotesList() {
    const list = document.getElementById('notes-list');
    if (!list) return;
    let filtered = cachedNotes;
    if (currentNoteFilter !== 'all') filtered = cachedNotes.filter(n => (n.category || 'other').toLowerCase() === currentNoteFilter);
    if (filtered.length === 0) { list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-book-open empty-icon"></i>No notes in this category.</div>'; return; }

    const colors = {
        physics: {bg:'rgba(99,102,241,0.1)',border:'rgba(99,102,241,0.2)',text:'#818cf8',icon:'fa-atom'},
        chemistry: {bg:'rgba(52,199,89,0.1)',border:'rgba(52,199,89,0.2)',text:'#34c759',icon:'fa-flask'},
        maths: {bg:'rgba(168,85,247,0.1)',border:'rgba(168,85,247,0.2)',text:'#c084fc',icon:'fa-calculator'},
        math: {bg:'rgba(168,85,247,0.1)',border:'rgba(168,85,247,0.2)',text:'#c084fc',icon:'fa-calculator'},
        english: {bg:'rgba(59,130,246,0.1)',border:'rgba(59,130,246,0.2)',text:'#3b82f6',icon:'fa-book'},
        hindi: {bg:'rgba(249,115,22,0.1)',border:'rgba(249,115,22,0.2)',text:'#f97316',icon:'fa-om'},
        other: {bg:'rgba(142,142,147,0.1)',border:'rgba(142,142,147,0.2)',text:'#8e8e93',icon:'fa-folder'}
    };
    list.innerHTML = filtered.map(item => {
        const cat = (item.category || 'other').toLowerCase();
        const c = colors[cat] || colors.other;
        const topic = item.topic || item.title || 'Study Material';
        const dateStr = item.date || new Date().toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});
        const catDisplay = item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : 'PDF';
        return '<div class="note-card">' +
            '<div class="note-card-header">' +
                '<div class="note-badge-row">' +
                    '<span class="note-subject-badge" style="background:'+c.bg+';border:1px solid '+c.border+';color:'+c.text+'"><i class="fa-solid '+c.icon+'"></i> '+catDisplay+'</span>' +
                    '<span class="note-date">'+dateStr+'</span>' +
                '</div>' +
                '<h4 class="note-topic">'+topic+'</h4>' +
            '</div>' +
            '<a href="'+item.link+'" target="_blank" rel="noopener" class="note-btn"><i class="fa-solid fa-external-link-alt"></i> Open in Browser</a>' +
        '</div>';
    }).join('');
}

// ==========================================
// ONLINE CLASSES
// ==========================================
window.filterClasses = function(category) {
    currentClassFilter = category;
    document.querySelectorAll('.cls-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.cat === category));
    renderClassesList();
};
function renderClassesList() {
    const list = document.getElementById('classes-list');
    if (!list) return;
    let filtered = cachedClasses;
    if (currentClassFilter !== 'all') filtered = cachedClasses.filter(c => (c.category || 'other').toLowerCase() === currentClassFilter);
    if (filtered.length === 0) { list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-video empty-icon"></i>No classes in this category.</div>'; return; }

    const colors = {
        physics:{grad:'from-indigo-500 to-purple-600',icon:'fa-atom'},
        chemistry:{grad:'from-green-500 to-emerald-600',icon:'fa-flask'},
        maths:{grad:'from-blue-500 to-cyan-600',icon:'fa-calculator'},
        math:{grad:'from-blue-500 to-cyan-600',icon:'fa-calculator'},
        english:{grad:'from-pink-500 to-rose-600',icon:'fa-book'},
        hindi:{grad:'from-orange-500 to-amber-600',icon:'fa-om'},
        other:{grad:'from-gray-500 to-gray-600',icon:'fa-video'}
    };
    list.innerHTML = filtered.map(item => {
        const cat = (item.category || 'other').toLowerCase();
        const c = colors[cat] || colors.other;
        const title = item.title || 'Online Class';
        const catDisplay = item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : 'Other';
        let videoId = '';
        if (item.link) {
            if (item.link.includes('youtube.com/watch?v=')) videoId = item.link.split('v=')[1]?.split('&')[0];
            else if (item.link.includes('youtu.be/')) videoId = item.link.split('youtu.be/')[1]?.split('?')[0];
        }
        const thumb = videoId ? 'https://img.youtube.com/vi/'+videoId+'/mqdefault.jpg' : '';
        return '<a href="'+item.link+'" target="_blank" rel="noopener" class="video-card">' +
            '<div class="video-thumb" style="background-image:url('+thumb+');background-size:cover;background-position:center;">' +
                (thumb ? '<div class="video-play"><i class="fa-solid fa-play"></i></div>' : '<i class="fa-solid '+c.icon+'" style="font-size:28px;color:#fff"></i>') +
            '</div>' +
            '<div class="video-info"><h4 class="video-title">'+title+'</h4><span class="video-cat" style="background:linear-gradient(135deg,'+c.grad.split(' ')[0].replace('from-','')+','+c.grad.split(' ')[1].replace('to-','')+')">'+catDisplay+'</span></div>' +
        '</a>';
    }).join('');
}

// ==========================================
// MUSIC HUB
// ==========================================
function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) return;
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    document.getElementsByTagName('script')[0].parentNode.insertBefore(tag, document.getElementsByTagName('script')[0]);
}
loadYouTubeAPI();

function initHubVisualizer() {
    const viz = document.getElementById('hub-visualizer');
    if (!viz || viz.children.length > 0) return;
    for (let i = 0; i < 16; i++) { const bar = document.createElement('div'); bar.className = 'vzb'; bar.style.height = '3px'; viz.appendChild(bar); }
}
function animateVisualizer() {
    document.querySelectorAll('.vzb').forEach(bar => { bar.style.height = (3 + Math.random() * 28) + 'px'; });
}

async function fetchVideoTitle(videoId) {
    try { const res = await fetch('https://noembed.com/embed?url=https://www.youtube.com/watch?v='+videoId); const data = await res.json(); return data.title || 'YouTube Audio'; }
    catch (e) { return 'YouTube Audio'; }
}
function extractVideoId(url) {
    let id = '';
    if (url.includes('youtube.com/watch?v=')) id = url.split('v=')[1]?.split('&')[0];
    else if (url.includes('youtu.be/')) id = url.split('youtu.be/')[1]?.split('?')[0];
    else if (url.includes('youtube.com/embed/')) id = url.split('embed/')[1]?.split('?')[0];
    else if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) id = url.trim();
    return id;
}
function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds/60), s = Math.floor(seconds%60);
    return m + ':' + String(s).padStart(2,'0');
}
function updateSeekbar() {
    if (!youtubePlayer || typeof youtubePlayer.getCurrentTime !== 'function') return;
    try {
        currentVideoTime = youtubePlayer.getCurrentTime() || 0;
        currentVideoDuration = youtubePlayer.getDuration() || 0;
        const pct = currentVideoDuration > 0 ? (currentVideoTime/currentVideoDuration)*100 : 0;
        document.getElementById('hub-seekbar-fill').style.width = pct + '%';
        document.getElementById('hub-seek-current').textContent = formatTime(currentVideoTime);
        document.getElementById('hub-seek-duration').textContent = formatTime(currentVideoDuration);
    } catch(e){}
}
window.seekTo = function(event) {
    const track = document.getElementById('hub-seekbar-track');
    if (!track || !youtubePlayer || typeof youtubePlayer.seekTo !== 'function') return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    youtubePlayer.seekTo(pct * currentVideoDuration, true);
    updateSeekbar();
};
window.skipForward = function() { if (youtubePlayer) youtubePlayer.seekTo(Math.min(currentVideoDuration, currentVideoTime + 10), true); updateSeekbar(); };
window.skipBackward = function() { if (youtubePlayer) youtubePlayer.seekTo(Math.max(0, currentVideoTime - 10), true); updateSeekbar(); };

window.loadYouTubeMusic = async function() {
    const input = document.getElementById('hub-yt-link');
    if (!input || !input.value.trim()) return;
    const videoId = extractVideoId(input.value.trim());
    if (!videoId) { showToast("Invalid YouTube link", "err"); return; }
    currentVideoId = videoId;
    showToast("Loading...", "inf");
    currentVideoTitle = await fetchVideoTitle(videoId);
    document.getElementById('hub-song-title').textContent = currentVideoTitle;
    document.getElementById('hub-song-status').textContent = 'Now Playing';
    const playlist = JSON.parse(localStorage.getItem('sg_playlist') || '[]');
    if (!playlist.find(p => p.id === currentVideoId)) {
        playlist.push({id: currentVideoId, title: currentVideoTitle});
        localStorage.setItem('sg_playlist', JSON.stringify(playlist));
        loadHubPlaylist();
    }
    loadYouTubePlayer(videoId, currentVideoTitle);
    input.value = '';
    showToast(currentVideoTitle + " loaded!", "suc");
};

function loadYouTubePlayer(videoId, title) {
    const ytp = document.getElementById('yt-player');
    if (!ytp) return;
    ytp.innerHTML = '<div id="yt-iframe-container"></div>';
    try {
        youtubePlayer = new YT.Player('yt-iframe-container', {
            width: 1, height: 1, videoId: videoId,
            playerVars: { autoplay: 1, controls: 0, disablekb: 1 },
            events: {
                onReady: function(event) {
                    event.target.playVideo();
                    setTimeout(() => {
                        currentVideoDuration = youtubePlayer.getDuration() || 0;
                        document.getElementById('hub-seek-duration').textContent = formatTime(currentVideoDuration);
                        setupMediaSession(title);
                    }, 1000);
                },
                onStateChange: function(event) {
                    if (event.data === YT.PlayerState.PLAYING) {
                        isPlaying = true;
                        document.getElementById('hub-play-icon').classList.remove('fa-play');
                        document.getElementById('hub-play-icon').classList.add('fa-pause');
                        document.getElementById('hub-disc-icon').className = 'fa-solid fa-compact-disc fa-spin';
                        document.getElementById('music-glow').classList.add('active');
                        if (!visualizerInterval) visualizerInterval = setInterval(animateVisualizer, 120);
                        if (!seekbarInterval) seekbarInterval = setInterval(updateSeekbar, 1000);
                        startMusicXPTracking();
                    } else if (event.data === YT.PlayerState.PAUSED) {
                        isPlaying = false;
                        document.getElementById('hub-play-icon').classList.remove('fa-pause');
                        document.getElementById('hub-play-icon').classList.add('fa-play');
                        document.getElementById('hub-disc-icon').className = 'fa-solid fa-compact-disc';
                        document.getElementById('music-glow').classList.remove('active');
                        if (visualizerInterval) { clearInterval(visualizerInterval); visualizerInterval = null; }
                        if (seekbarInterval) { clearInterval(seekbarInterval); seekbarInterval = null; }
                        document.querySelectorAll('.vzb').forEach(bar => bar.style.height = '3px');
                        stopMusicXPTracking();
                    } else if (event.data === YT.PlayerState.ENDED) {
                        isPlaying = false;
                        document.getElementById('hub-play-icon').classList.remove('fa-pause');
                        document.getElementById('hub-play-icon').classList.add('fa-play');
                        stopMusicXPTracking();
                        if (playlistMode) nextTrack();
                    }
                }
            }
        });
    } catch (e) {
        ytp.innerHTML = '<iframe id="yt-iframe" width="1" height="1" src="https://www.youtube.com/embed/'+videoId+'?enablejsapi=1&autoplay=1&controls=0" frameborder="0" allow="autoplay"></iframe>';
    }
    ytp.classList.remove('hidden');
}

function setupMediaSession(title) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title, artist: 'StudyGram Pro', album: 'Study & Focus',
            artwork: [{src:'https://cdn-icons-png.flaticon.com/512/727/727218.png', sizes:'512x512', type:'image/png'}]
        });
        navigator.mediaSession.setActionHandler('play', () => youtubePlayer?.playVideo());
        navigator.mediaSession.setActionHandler('pause', () => youtubePlayer?.pauseVideo());
        navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
        navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    }
}

function startMusicXPTracking() {
    if (musicXPInterval) clearInterval(musicXPInterval);
    musicXPInterval = setInterval(() => {
        musicTotalListened++;
        if (musicTotalListened % 60 === 0) {
            musicEarnedXP += 10;
            addXP(10, 'music_listen');
            document.getElementById('music-earn-xp').textContent = musicEarnedXP;
            document.getElementById('music-earn-display').classList.remove('hidden');
            showToast('+10 EXP for listening!', 'suc');
        }
    }, 1000);
}
function stopMusicXPTracking() { if (musicXPInterval) { clearInterval(musicXPInterval); musicXPInterval = null; } }

window.togglePlay = function() { if (!youtubePlayer) return; if (isPlaying) youtubePlayer.pauseVideo(); else youtubePlayer.playVideo(); };
window.setVolume = function(val) { if (youtubePlayer && typeof youtubePlayer.setVolume === 'function') youtubePlayer.setVolume(val); };
window.togglePlaylistMode = function() {
    playlistMode = !playlistMode;
    const btn = document.getElementById('hub-playlist-toggle');
    if (btn) btn.innerHTML = playlistMode ? '<i class="fa-solid fa-repeat"></i> Loop: On' : '<i class="fa-solid fa-repeat"></i> Loop: Off';
};

function loadHubPlaylist() {
    const playlist = JSON.parse(localStorage.getItem('sg_playlist') || '[]');
    const container = document.getElementById('hub-playlist-items');
    if (!container) return;
    if (playlist.length === 0) { container.innerHTML = '<div class="empty-state" style="padding:24px;"><i class="fa-solid fa-music empty-icon"></i>No songs yet.</div>'; return; }
    container.innerHTML = playlist.map((item, i) => {
        const isActive = item.id === currentVideoId;
        return '<div class="playlist-item ' + (isActive ? 'active' : '') + '" onclick="haptic(); playFromPlaylist('+i+')">' +
            '<div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--accent));display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;flex-shrink:0;"><i class="fa-solid fa-music"></i></div>' +
            '<div style="flex:1;min-width:0;"><p style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + item.title + '</p></div>' +
            '<button onclick="event.stopPropagation(); haptic(); removeFromPlaylist('+i+');" style="background:none;border:none;color:#ff3b30;cursor:pointer;font-size:12px;padding:4px;"><i class="fa-solid fa-times"></i></button>' +
        '</div>';
    }).join('');
}
window.playFromPlaylist = async function(index) {
    const playlist = JSON.parse(localStorage.getItem('sg_playlist') || '[]');
    if (!playlist[index]) return;
    currentVideoId = playlist[index].id;
    currentVideoTitle = playlist[index].title;
    document.getElementById('hub-song-title').textContent = playlist[index].title;
    document.getElementById('hub-song-status').textContent = 'Now Playing';
    loadHubPlaylist();
    loadYouTubePlayer(playlist[index].id, playlist[index].title);
};
window.removeFromPlaylist = function(index) {
    const playlist = JSON.parse(localStorage.getItem('sg_playlist') || '[]');
    playlist.splice(index, 1);
    localStorage.setItem('sg_playlist', JSON.stringify(playlist));
    loadHubPlaylist();
};
window.clearPlaylist = function() {
    if (confirm("Clear all songs?")) { localStorage.removeItem('sg_playlist'); loadHubPlaylist(); showToast("Playlist cleared!", "inf"); }
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
window.onYouTubeIframeAPIReady = function() { console.log('YT API Ready'); };

// ==========================================
// DATE SHEET
// ==========================================
function loadDateSheet() {
    if (!db) return;
    onValue(ref(db, 'public_data/exam_schedule'), (snap) => {
        const list = document.getElementById('datesheet-list');
        if (!list) return;
        if (!snap.exists()) { list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-calendar-xmark empty-icon"></i>No exams scheduled.</div>'; return; }
        let exams = [];
        snap.forEach(child => { exams.push({...child.val(), key: child.key}); });
        exams.sort((a, b) => {
            const dA = (a.date || '9999-12-31') + 'T' + (a.time || '23:59');
            const dB = (b.date || '9999-12-31') + 'T' + (b.time || '23:59');
            return dA.localeCompare(dB);
        });
        const subjectColors = { hindi:'from-orange-500 to-amber-600', english:'from-pink-500 to-rose-600', math:'from-blue-500 to-cyan-600', maths:'from-blue-500 to-cyan-600', physics:'from-indigo-500 to-purple-600', chemistry:'from-green-500 to-emerald-600' };
        list.innerHTML = exams.map((exam, i) => {
            const dateObj = new Date(exam.date + 'T' + (exam.time || '00:00'));
            const isUpcoming = dateObj > new Date();
            const grad = subjectColors[(exam.subject || '').toLowerCase()] || 'from-gray-500 to-gray-600';
            return '<div class="datesheet-card ' + (isUpcoming ? 'upcoming' : 'past') + '">' +
                '<div class="datesheet-header-bar" style="background:linear-gradient(90deg,'+grad.replace('from-','').replace(' to-',',')+'">' +
                    '<span class="datesheet-index">#'+(i+1)+'</span><span class="datesheet-status">'+(isUpcoming?'UPCOMING':'COMPLETED')+'</span>' +
                '</div>' +
                '<div class="datesheet-body">' +
                    '<h3 style="font-weight:900;font-size:18px;">'+exam.subject+'</h3>' +
                    '<p style="font-size:11px;color:var(--text-muted);font-weight:500;margin-top:2px;">'+exam.examName+'</p>' +
                    '<div class="datesheet-meta"><span><i class="fa-regular fa-calendar"></i> '+dateObj.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+'</span><span><i class="fa-regular fa-clock"></i> '+(exam.time||'TBA')+'</span></div>' +
                    '<div class="datesheet-shift"><i class="fa-solid fa-door-open"></i> '+(exam.meeting||'TBA')+'</div>' +
                '</div></div>';
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
        document.getElementById('stat-total-users').textContent = totalUsers;
        document.getElementById('user-count').textContent = totalUsers;
        document.getElementById('admin-stat-total-users').textContent = totalUsers;

        let activeToday = 0, premiumCount = 0, bannedCount = 0;
        const today = new Date().toISOString().split('T')[0];
        const users = [];
        if (snap.exists()) {
            snap.forEach(child => {
                const d = child.val();
                if (d.lastActive === today) activeToday++;
                if (d.isPremium === true) premiumCount++;
                users.push({...d, uid: child.key});
            });
        }
        document.getElementById('stat-active-today').textContent = activeToday;
        document.getElementById('admin-stat-active-today').textContent = activeToday;
        document.getElementById('stat-total-premium').textContent = premiumCount;
        document.getElementById('admin-stat-premium-users').textContent = premiumCount;

        // Admin users list
        const ul = document.getElementById('users-list');
        if (ul) {
            if (users.length === 0) ul.innerHTML = '<div class="text-muted" style="text-align:center;">No users</div>';
            else ul.innerHTML = users.map(u => {
                const stats = u.stats || {};
                return '<div class="admin-user-item">' +
                    '<img src="'+(u.photo || 'https://cdn-icons-png.flaticon.com/512/149/149071.png')+'" class="admin-user-avatar" onerror="this.src=\'https://cdn-icons-png.flaticon.com/512/149/149071.png\'">' +
                    '<div class="admin-user-info"><p class="admin-user-name">'+(u.name || 'Unknown')+(u.isPremium ? ' <i class="fa-solid fa-crown admin-user-premium"></i>' : '')+'</p><p class="admin-user-email">'+(u.email || '')+'</p></div>' +
                    '<span class="admin-user-level">Lv.'+(stats.level || 1)+'</span>' +
                '</div>';
            }).join('');
        }
    });

    // Notes
    onValue(ref(db, 'public_data/notes'), (snap) => {
        const adminList = document.getElementById('manage-notes-list');
        document.getElementById('stat-total-notes').textContent = snap.exists() ? Object.keys(snap.val()).length : 0;
        cachedNotes = [];
        if (adminList) adminList.innerHTML = '';
        if (snap.exists()) {
            snap.forEach(c => { let d = c.val(); d._key = c.key; cachedNotes.push(d);
                if (adminList) adminList.innerHTML += '<div class="admin-content-item"><span>'+(d.category||'PDF')+' - '+(d.topic||d.title)+'</span><button onclick="haptic(); deleteItem(\'public_data/notes/'+c.key+'\');" class="admin-delete-btn"><i class="fa-solid fa-trash"></i></button></div>';
            });
        } else if (adminList) adminList.innerHTML = '<span class="text-muted">No notes</span>';
        renderNotesList();
    });

    // Classes
    onValue(ref(db, 'public_data/classes'), (snap) => {
        const adminList = document.getElementById('manage-classes-list');
        document.getElementById('stat-total-classes').textContent = snap.exists() ? Object.keys(snap.val()).length : 0;
        cachedClasses = [];
        if (adminList) adminList.innerHTML = '';
        if (snap.exists()) {
            snap.forEach(c => { let d = c.val(); d._key = c.key; cachedClasses.push(d);
                if (adminList) adminList.innerHTML += '<div class="admin-content-item"><span>'+(d.category||'Other')+' - '+(d.title||'Class')+'</span><button onclick="haptic(); deleteItem(\'public_data/classes/'+c.key+'\');" class="admin-delete-btn"><i class="fa-solid fa-trash"></i></button></div>';
            });
        } else if (adminList) adminList.innerHTML = '<span class="text-muted">No classes</span>';
        renderClassesList();
    });

    // Video Lectures
    onValue(ref(db, 'public_data/lectures'), (snap) => {
        const adminList = document.getElementById('manage-lectures-list');
        cachedLectures = [];
        if (adminList) adminList.innerHTML = '';
        if (snap.exists()) {
            snap.forEach(c => { let d = c.val(); d._key = c.key; cachedLectures.push(d);
                if (adminList) adminList.innerHTML += '<div class="admin-content-item"><span>'+(d.subject||d.category||'General')+' - '+(d.chapter||d.topic||'Lecture')+'</span><button onclick="haptic(); deleteItem(\'public_data/lectures/'+c.key+'\');" class="admin-delete-btn"><i class="fa-solid fa-trash"></i></button></div>';
            });
        } else if (adminList) adminList.innerHTML = '<span class="text-muted">No lectures</span>';
        renderLecturesList();
    });

    // Progress
    onValue(ref(db, 'public_data/status'), (snap) => {
        const box = document.getElementById('course-status');
        if (!box) return;
        const d = snap.val() || {hin:0, eng:0, math:0, phy:0, chem:0};
        const hexColors = {hin:'#f97316', eng:'#3b82f6', math:'#10b981', phy:'#6366f1', chem:'#a855f7'};
        const names = {hin:'Hindi', eng:'English', math:'Maths', phy:'Physics', chem:'Chemistry'};
        let html = '<h4 class="card-title" style="margin-bottom:16px;"><i class="fa-solid fa-chart-simple" style="color:var(--primary)"></i> Syllabus Coverage</h4><div style="display:flex;flex-direction:column;gap:16px;">';
        ['hin','eng','math','phy','chem'].forEach(s => {
            const val = d[s] || 0;
            html += '<div><div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:4px;"><span>'+names[s]+'</span><span>'+val+'%</span></div>' +
                '<div style="height:8px;background:var(--bg-elevated);border-radius:4px;overflow:hidden;border:1px solid var(--border);"><div style="height:100%;border-radius:4px;transition:width 1s ease;width:'+val+'%;background:'+hexColors[s]+';opacity:0.85;"></div></div></div>';
        });
        box.innerHTML = html + '</div>';
    });

    // Notices
    onValue(ref(db, 'public_data/notices'), (snap) => {
        const list = document.getElementById('notice-list');
        const adminList = document.getElementById('manage-notices-list');
        if (list) list.innerHTML = '';
        if (adminList) adminList.innerHTML = '';
        document.getElementById('stat-total-notices').textContent = snap.exists() ? Object.keys(snap.val()).length : 0;
        if (snap.exists()) {
            snap.forEach(c => {
                const d = c.val(), k = c.key;
                if (list) list.innerHTML = '<div class="card" style="border-left:3px solid var(--warning);margin-bottom:12px;position:relative;overflow:hidden;">' +
                    '<div style="position:absolute;right:-8px;top:-8px;font-size:56px;color:var(--warning);opacity:0.04;"><i class="fa-solid fa-bell"></i></div>' +
                    '<h4 style="font-weight:700;position:relative;z-index:1;">'+d.title+'</h4>' +
                    '<p style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-top:4px;">'+d.date+'</p>' +
                    '<p style="font-size:13px;margin-top:8px;color:var(--text-secondary);line-height:1.6;white-space:pre-wrap;">'+d.msg+'</p>' +
                '</div>' + list.innerHTML;
                if (adminList) adminList.innerHTML += '<div class="admin-content-item"><span>'+d.title+'</span><button onclick="haptic(); deleteItem(\'public_data/notices/'+k+'\');" class="admin-delete-btn"><i class="fa-solid fa-trash"></i></button></div>';
            });
        } else {
            if (list) list.innerHTML = '<div class="empty-state">No updates yet.</div>';
            if (adminList) adminList.innerHTML = '<span class="text-muted">No notices</span>';
        }
    });

    // Exam Schedule (modal)
    onValue(ref(db, 'public_data/exam_schedule'), (snap) => {
        const list = document.getElementById('modal-schedule-list');
        const adminList = document.getElementById('manage-exams-list');
        if (list) list.innerHTML = '';
        if (adminList) adminList.innerHTML = '';
        if (snap.exists()) {
            snap.forEach(c => {
                const d = c.val(), k = c.key;
                if (list) list.innerHTML += '<div class="card" style="margin-bottom:10px;border:1px solid rgba(99,102,241,0.2);">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                        '<span style="background:var(--primary);color:#fff;font-size:10px;padding:3px 10px;border-radius:6px;font-weight:700;">'+d.examName+'</span>' +
                        '<span style="font-size:11px;font-weight:700;color:#818cf8;background:rgba(99,102,241,0.1);padding:3px 10px;border-radius:6px;"><i class="fa-regular fa-calendar"></i> '+d.date+'</span>' +
                    '</div><h3 style="font-weight:900;font-size:18px;">'+d.subject+'</h3>' +
                    '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:8px;background:var(--bg-elevated);padding:8px;border-radius:8px;">' +
                        '<span><i class="fa-regular fa-clock"></i> '+(d.time||'TBA')+'</span><span><i class="fa-solid fa-door-open"></i> '+(d.meeting||'TBA')+'</span>' +
                    '</div></div>';
                if (adminList) adminList.innerHTML += '<div class="admin-content-item"><span>'+d.subject+' ('+d.examName+')</span><button onclick="haptic(); deleteItem(\'public_data/exam_schedule/'+k+'\');" class="admin-delete-btn"><i class="fa-solid fa-trash"></i></button></div>';
            });
        } else {
            if (list) list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-mug-hot empty-icon"></i>No exams scheduled! Relax!</div>';
            if (adminList) adminList.innerHTML = '<span class="text-muted">No exams</span>';
        }
    });

    // Countdown
    onValue(ref(db, 'public_data/countdown'), (snap) => {
        if (snap.exists()) {
            const val = snap.val();
            if (typeof val === 'object' && val !== null) {
                if (val.date) { globalTargetDate = new Date(val.date); if (isNaN(globalTargetDate.getTime())) globalTargetDate = new Date("2026-02-15T00:00:00"); }
                if (val.examName) globalExamName = val.examName;
            }
            document.getElementById('exam-countdown-label').textContent = globalExamName;
        }
    });

    // Social Hub Data
    // Posts
    onValue(ref(db, 'social/posts'), (snap) => {
        const adminList = document.getElementById('admin-posts-list');
        cachedPosts = [];
        if (adminList) adminList.innerHTML = '';
        if (snap.exists()) {
            snap.forEach(c => {
                const d = c.val(); d.key = c.key; cachedPosts.push(d);
                if (adminList) adminList.innerHTML += '<div class="admin-content-item"><span>'+escapeHtml(d.userName || 'User')+': '+escapeHtml((d.caption || '').substring(0, 40))+'</span><button onclick="haptic(); deleteItem(\'social/posts/'+c.key+'\');" class="admin-delete-btn"><i class="fa-solid fa-trash"></i></button></div>';
            });
        } else if (adminList) adminList.innerHTML = '<span class="text-muted">No posts</span>';
        if (currentSocialTab === 'feed') renderFeed();
    });

    // Stories
    onValue(ref(db, 'social/stories'), (snap) => {
        const adminList = document.getElementById('admin-stories-list');
        cachedStories = [];
        if (adminList) adminList.innerHTML = '';
        if (snap.exists()) {
            snap.forEach(c => {
                const d = c.val(); d.key = c.key; cachedStories.push(d);
                if (adminList) adminList.innerHTML += '<div class="admin-content-item"><span>'+escapeHtml(d.userName || 'User')+': '+escapeHtml((d.text || d.type || 'story').substring(0, 40))+'</span><button onclick="haptic(); deleteItem(\'social/stories/'+c.key+'\');" class="admin-delete-btn"><i class="fa-solid fa-trash"></i></button></div>';
            });
        } else if (adminList) adminList.innerHTML = '<span class="text-muted">No stories</span>';
        if (currentSocialTab === 'stories') renderStories();
    });

    // Reels
    onValue(ref(db, 'social/reels'), (snap) => {
        cachedReels = [];
        if (snap.exists()) {
            snap.forEach(c => { const d = c.val(); d.key = c.key; cachedReels.push(d); });
        }
        document.getElementById('admin-stat-total-reels').textContent = cachedReels.length;
        if (currentSocialTab === 'reels') renderReels();
    });

    // Banned Users
    onValue(ref(db, 'banned_users'), (snap) => {
        const list = document.getElementById('banned-users-list');
        if (!list) return;
        if (!snap.exists()) { list.innerHTML = '<span class="text-muted">No banned users</span>'; return; }
        let html = '';
        snap.forEach(c => {
            const d = c.val();
            html += '<div class="admin-content-item"><span><i class="fa-solid fa-ban" style="color:var(--danger);margin-right:6px;"></i>'+escapeHtml(d.name || c.key)+' - '+escapeHtml(d.reason || 'No reason')+'</span><button onclick="haptic(); unbanUser(\''+c.key+'\');" class="admin-delete-btn" style="color:var(--success);border-color:rgba(52,199,89,0.2);background:rgba(52,199,89,0.1);"><i class="fa-solid fa-check"></i></button></div>';
        });
        list.innerHTML = html;
    });
}

// ==========================================
// ADMIN GOD MODE
// ==========================================
window.unlockAdmin = function() {
    const pass = document.getElementById('admin-pass')?.value;
    const errorEl = document.getElementById('admin-error');
    if (pass === ADMIN_PASS) {
        document.getElementById('admin-auth')?.classList.add('hidden');
        document.getElementById('admin-controls')?.classList.remove('hidden');
        document.getElementById('admin-pass').value = '';
        if (errorEl) errorEl.classList.add('hidden');
        isAdminUnlocked = true;
        showToast("Admin Portal Unlocked", "suc");
    } else {
        if (errorEl) { errorEl.textContent = "Wrong Master Key!"; errorEl.classList.remove('hidden'); }
        showToast("Wrong Key", "err");
    }
};
window.lockAdmin = function() {
    document.getElementById('admin-auth')?.classList.remove('hidden');
    document.getElementById('admin-controls')?.classList.add('hidden');
    isAdminUnlocked = false;
    showToast("Portal Locked", "inf");
};

// Delete Post/Story (Content Moderation)
window.deleteItem = async function(path) {
    if (!db) return;
    if (confirm("Delete this item?")) {
        try { await remove(ref(db, path)); showToast("Deleted!", "suc"); }
        catch (e) { showToast("Delete failed", "err"); }
    }
};

// Ban User
window.banUser = async function() {
    const uid = document.getElementById('ban-uid')?.value.trim();
    const reason = document.getElementById('ban-reason')?.value.trim() || 'Violation of community guidelines';
    if (!uid) { showToast("Enter a UID", "err"); return; }
    if (!db) return;
    try {
        await set(ref(db, 'banned_users/' + uid), { reason, bannedAt: Date.now(), bannedBy: currentUser?.uid || 'admin' });
        showToast("User banned!", "suc");
        document.getElementById('ban-uid').value = '';
        document.getElementById('ban-reason').value = '';
    } catch (e) { showToast("Failed: " + e.message, "err"); }
};
window.unbanUser = async function(uid) {
    if (!db) return;
    if (!confirm("Unban this user?")) return;
    try { await remove(ref(db, 'banned_users/' + uid)); showToast("User unbanned!", "suc"); }
    catch (e) { showToast("Failed", "err"); }
};

// Global Announcement
window.sendGlobalAnnouncement = async function() {
    const title = document.getElementById('announcement-title')?.value.trim();
    const message = document.getElementById('announcement-message')?.value.trim();
    if (!title || !message) { showToast("Enter title and message!", "err"); return; }
    if (!db) return;
    try {
        await push(ref(db, 'public_data/notices'), {
            title, msg: message,
            date: new Date().toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'})
        });
        showToast("Announcement sent to all users!", "suc");
        document.getElementById('announcement-title').value = '';
        document.getElementById('announcement-message').value = '';
    } catch (e) { showToast("Failed: " + e.message, "err"); }
};

window.adminAction = async function(type) {
    if (!db) { showToast("Database not connected", "err"); return; }
    try {
        if (type === 'note') {
            const cat = document.getElementById('n-category')?.value;
            const topic = document.getElementById('n-topic')?.value.trim();
            const l = document.getElementById('n-link')?.value.trim();
            if (!topic || !l) return showToast("All fields required", "err");
            await push(ref(db, 'public_data/notes'), { category: cat, topic, title: topic, link: l, date: new Date().toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}) });
        } else if (type === 'class') {
            const cat = document.getElementById('vc-category')?.value;
            const title = document.getElementById('vc-title')?.value.trim();
            const l = document.getElementById('vc-link')?.value.trim();
            if (!title || !l) return showToast("All fields required", "err");
            await push(ref(db, 'public_data/classes'), { category: cat, title, link: l });
        } else if (type === 'lecture') {
            const cat = document.getElementById('lecture-category')?.value;
            const subject = document.getElementById('lecture-subject')?.value.trim();
            const chapter = document.getElementById('lecture-chapter')?.value.trim();
            const l = document.getElementById('lecture-link')?.value.trim();
            if (!subject || !chapter || !l) return showToast("All fields required", "err");
            const videoId = extractVideoId(l);
            if (!videoId) return showToast("Invalid YouTube link", "err");
            await push(ref(db, 'public_data/lectures'), {
                category: cat, subject, chapter, link: l,
                date: new Date().toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'})
            });
        } else if (type === 'progress') {
            await set(ref(db, 'public_data/status'), {
                hin: clamp(document.getElementById('p-hin')?.value), eng: clamp(document.getElementById('p-eng')?.value),
                math: clamp(document.getElementById('p-math')?.value), phy: clamp(document.getElementById('p-phy')?.value),
                chem: clamp(document.getElementById('p-chem')?.value)
            });
        } else if (type === 'notice') {
            const t = document.getElementById('nt-title')?.value.trim();
            const m = document.getElementById('nt-desc')?.value.trim();
            if (!t || !m) return showToast("All fields required", "err");
            await push(ref(db, 'public_data/notices'), { title: t, msg: m, date: new Date().toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}) });
        } else if (type === 'exam') {
            const nm = document.getElementById('ex-name')?.value.trim();
            const sb = document.getElementById('ex-sub')?.value.trim();
            const dt = document.getElementById('ex-date')?.value;
            const tm = document.getElementById('ex-time')?.value;
            const mt = document.getElementById('ex-meet')?.value.trim();
            if (!nm || !sb || !dt) return showToast("Required fields missing", "err");
            await push(ref(db, 'public_data/exam_schedule'), { examName: nm, subject: sb, date: dt, time: tm || 'TBA', meeting: mt || 'TBA' });
        } else if (type === 'countdown') {
            const en = document.getElementById('cd-exam-name')?.value.trim();
            const d = document.getElementById('cd-date')?.value;
            if (!d) return;
            await set(ref(db, 'public_data/countdown'), { examName: en || 'Final Board Exams', date: d });
        }
        showToast("Saved successfully!", "suc");
        document.querySelectorAll('details[open] input:not([type="date"]):not([type="datetime-local"]), details[open] textarea').forEach(el => { if (el.id !== 'admin-pass') el.value = ''; });
    } catch (e) { showToast("Error: " + e.message, "err"); console.error(e); }
};
function clamp(v) { return Math.min(100, Math.max(0, parseInt(v) || 0)); }

// ==========================================
// COUNTDOWN TIMER
// ==========================================
setInterval(() => {
    const diff = globalTargetDate - new Date();
    const de = document.getElementById('count-days');
    const he = document.getElementById('count-hours');
    const me = document.getElementById('count-minutes');
    if (!de || !he || !me) return;
    if (diff > 0) {
        de.textContent = String(Math.floor(diff/86400000)).padStart(2,'0');
        he.textContent = String(Math.floor((diff/3600000)%24)).padStart(2,'0');
        me.textContent = String(Math.floor((diff/60000)%60)).padStart(2,'0');
    } else { de.textContent = "00"; he.textContent = "00"; me.textContent = "00"; }
}, 1000);

// ==========================================
// MODALS
// ==========================================
window.openExamModal = function() { document.getElementById('exam-modal')?.classList.add('active'); };
window.closeExamModal = function() { document.getElementById('exam-modal')?.classList.remove('active'); };

// Close on backdrop click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
});

// ==========================================
// PWA
// ==========================================
let deferredPrompt = null;
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/Study12th/sw.js')
            .then(r => console.log('SW registered:', r.scope))
            .catch(e => console.warn('SW failed:', e));
    });
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; document.getElementById('pwa-install-btn')?.classList.remove('hidden'); });
window.installPWA = async function() {
    if (!deferredPrompt) { showToast("Install not available", "warn"); return; }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') { showToast("Installing...", "suc"); document.getElementById('pwa-install-btn')?.classList.add('hidden'); }
    else showToast("Install cancelled", "inf");
    deferredPrompt = null;
};
if (window.matchMedia('(display-mode: standalone)').matches) document.getElementById('pwa-install-btn')?.classList.add('hidden');

// ==========================================
// LOGIN / AUTH
// ==========================================
window.handleLogin = async function() {
    if (!auth) { showToast("Auth not ready", "err"); return; }
    if (isLoggingIn) return;
    isLoggingIn = true;
    const btn = document.getElementById('login-btn');
    const errorEl = document.getElementById('login-error');
    try {
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="margin-right:8px;"></i> Connecting...';
        btn.disabled = true;
        if (errorEl) errorEl.classList.add('hidden');
        await signInWithPopup(auth, provider);
        showToast("Welcome!", "suc");
    } catch (e) {
        let msg = "Login failed. Try again.";
        if (e.code === 'auth/popup-closed-by-user') msg = "Popup closed. Try again.";
        else if (e.code === 'auth/popup-blocked') msg = "Popup blocked! Allow popups.";
        else if (e.code === 'auth/network-request-failed') msg = "Network error.";
        if (errorEl) { errorEl.textContent = msg; errorEl.classList.remove('hidden'); }
        showToast(msg, "err");
        btn.innerHTML = '<img src="https://www.svgrepo.com/show/475656/google-color.svg" class="login-btn-icon" alt="G"> Continue with Google';
        btn.disabled = false;
    } finally { isLoggingIn = false; }
};

window.logout = async function() {
    if (!auth) return;
    try { await signOut(auth); welcomeShown = false; isPremium = false; document.body.classList.remove('premium-active'); showToast("Logged out!", "inf"); }
    catch (e) { showToast("Logout failed", "err"); }
};

// ==========================================
// THEME TOGGLE (PREMIUM ONLY)
// ==========================================
window.toggleTheme = function() {
    if (!checkPremiumAccess()) { showPremiumPopup(); return; }
    document.body.classList.toggle('light-mode');
    const icon = document.getElementById('theme-icon');
    if (document.body.classList.contains('light-mode')) {
        if (icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
        showToast("Light Mode!", "suc");
    } else {
        if (icon) { icon.classList.remove('fa-sun'); icon.classList.add('fa-moon'); }
        showToast("Dark Mode!", "suc");
    }
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
            // Check banned
            try {
                const banSnap = await get(ref(db, 'banned_users/' + user.uid));
                if (banSnap.exists()) { await signOut(auth); showToast("Your account has been banned.", "err"); return; }
            } catch (e) {}

            currentUser = user;
            const firstName = user.displayName ? user.displayName.split(' ')[0] : 'Student';
            const un = document.getElementById('user-name');
            const pn = document.getElementById('prof-name');
            if (un) un.innerText = firstName;
            if (pn) pn.innerText = user.displayName || 'Student';

            await syncUserDataFromFirebase(user.uid);

            const userData = getUserData();
            document.getElementById('prof-roll').innerText = userData.rollNumber;

            const photoUrl = user.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
            document.getElementById('user-img').src = photoUrl;
            document.getElementById('prof-img').src = photoUrl;

            if (db) {
                set(ref(db, 'users/' + user.uid), { name: user.displayName || 'Student', email: user.email, photo: user.photoURL || '', lastLogin: new Date().toISOString() });
                update(ref(db, 'users/' + user.uid), { lastActive: new Date().toISOString().split('T')[0] });
            }

            // Show skeleton then hide
            showSkeleton();

            loginScreen?.classList.add('fade-out');
            setTimeout(() => {
                loginScreen?.classList.add('hidden');
                loginScreen?.classList.remove('fade-out');
                mainNav?.classList.remove('hidden');
                mainContent?.classList.remove('hidden');
                bottomNav?.classList.remove('hidden');
                switchTab('home');
                loadDatabaseData();
                loadAttendance();
                loadQuickNotes();
                loadDateSheet();
                loadHubPlaylist();
                initHubVisualizer();
                updateLecturesUI();

                // Hide skeleton after everything loads
                setTimeout(hideSkeleton, 800);

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
                document.getElementById('prof-focus').textContent = Math.floor(totalFocus / 60);
                if (!welcomeShown) setTimeout(showWelcomeModal, 1000);
            }, 600);
        } else {
            currentUser = null;
            isPremium = false;
            document.body.classList.remove('premium-active');
            loginScreen?.classList.remove('hidden');
            loginScreen?.classList.remove('fade-out');
            mainNav?.classList.add('hidden');
            mainContent?.classList.add('hidden');
            bottomNav?.classList.add('hidden');
            const btn = document.getElementById('login-btn');
            if (btn) { btn.innerHTML = '<img src="https://www.svgrepo.com/show/475656/google-color.svg" class="login-btn-icon" alt="G"> Continue with Google'; btn.disabled = false; }
            hideSkeleton();
        }
    });
}

// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
});

// ==========================================
// ESCAPE HELPER
// ==========================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('StudyGram Pro v4.0 loaded - Nothing OS Edition');
