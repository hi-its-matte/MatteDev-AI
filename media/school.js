import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getDatabase,
  ref,
  get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const DEFAULT_PROXY_URL = "https://ai.api.mattedev.com/chat";
const PROXY_URL = window.__CHAT_API_URL__ || DEFAULT_PROXY_URL;
let isSending = false;

const firebaseConfig = {
  apiKey: "AIzaSyC7Tbqt5FzJK8Z_USkCMWxXiHZp8uRN26A",
  authDomain: "mattedev-account.firebaseapp.com",
  databaseURL: "https://mattedev-account-default-rtdb.firebaseio.com",
  projectId: "mattedev-account",
  storageBucket: "mattedev-account.firebasestorage.app",
  messagingSenderId: "77268069903",
  appId: "1:77268069903:web:040aa6c3981eb3650afd7a"
};

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const database = getDatabase(app);

let currentUser            = null;
let activeChatId           = null;
let activeChatHistory      = [];
let chatCreationTimestamps = [];

let currentSettings = { aiStyle: "normal", aiTone: "balanced", memoryNote: "" };

const ALLOWED_MODELS = new Set([
  'gemini-3.1-flash-lite-preview',
]);

let userMemory = {
  contextMemory:   { facts: [], note: "" },
  personalization: { aiStyle: "normal", aiTone: "balanced" },
  preferences:     { language: "it", responseMode: "balanced" }
};

if (typeof window.marked !== "undefined") {
  window.marked.setOptions({ breaks: true, gfm: true });
}

// ── Availability check ──
async function redirectByAvailability() {
  try {
    const snap = await get(ref(database, "auth/disabled"));
    window.location.replace(snap.val() === true ? "/pages/disabled.html" : "/pages/login.html");
  } catch {
    window.location.replace("/pages/login.html");
  }
}

// ─────────────────────────────────────────────
// FIRESTORE REFS
// BUG FIX 1: chatHistoryColRef aveva 4 segmenti (pari) → aggiunto "data" come doc intermedio
// users/{uid}/ai/data/chatHistory/{autoId}  ← ora 5 segmenti (dispari) ✅
// ─────────────────────────────────────────────

const userDocRef            = (uid)      => doc(db, "users", uid);
const chatsColRef           = (uid)      => collection(db, "users", uid, "ai", "meta", "chats");
const chatDocRef            = (uid, cid) => doc(db, "users", uid, "ai", "meta", "chats", cid);
const messagesColRef        = (uid, cid) => collection(db, "users", uid, "ai", "meta", "chats", cid, "messages");
const personalizationDocRef = (uid)      => doc(db, "users", uid, "ai", "personalization");
const preferencesDocRef     = (uid)      => doc(db, "users", uid, "ai", "preferences");
const contextMemoryDocRef   = (uid)      => doc(db, "users", uid, "ai", "contextMemory");
// FIX BUG 1: era collection(db, "users", uid, "ai", "chatHistory") → 4 segmenti INVALIDI
const chatHistoryColRef     = (uid)      => collection(db, "users", uid, "ai", "data", "chatHistory");

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────

function sanitizeTitle(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "Nuova chat";
  return clean.length > 45 ? `${clean.slice(0, 45)}\u2026` : clean;
}

function getCurrentIsoDate() { return new Date().toISOString(); }

function buildSystemMemoryPrompt() {
  const { contextMemory, personalization } = userMemory;

  const factsText = contextMemory.facts?.length
    ? contextMemory.facts.map(f => `- ${f}`).join("\n")
    : "- Nessun fatto utente salvato";

  return [
    "🎓 MODALITÀ SCHOOL ATTIVA",
    "",
    "Sei un tutor scolastico.",
    "",
    "REGOLE OBBLIGATORIE:",
    "- NON risolvere esercizi direttamente",
    "- NON dare risposte finali pronte",
    "- Spiega passo passo",
    "- Guida lo studente con domande",
    "- Dai esempi simili ma NON identici",
    "",
    "OBIETTIVO:",
    "Far capire allo studente, non fare i compiti al posto suo.",
    "",
    "Memoria utente:",
    `Nota: ${contextMemory.note || "nessuna"}`,
    `Stile: ${personalization.aiStyle}`,
    `Tono: ${personalization.aiTone}`,
    "",
    "Fatti:",
    factsText
  ].join("\n");
}

function extractMemoryFacts(text) {
  const input = String(text || "").trim();
  if (!input) return [];
  const heuristics = [/\bmi chiamo\b/i, /\bpreferisco\b/i, /\bsono\b/i, /\blavoro\b/i, /\bvivo\b/i, /\bmi piace\b/i];
  if (!heuristics.some(r => r.test(input))) return [];
  return [input.length > 180 ? `${input.slice(0, 180)}\u2026` : input];
}

// ─────────────────────────────────────────────
// USER PROFILE
// ─────────────────────────────────────────────

async function loadUserProfile(uid) {
  try {
    const snap = await getDoc(userDocRef(uid));
    const data = snap.exists() ? snap.data() : {};
    const username = data.username || currentUser?.displayName || "Utente";
    const pfpUrl   = data.pfp     || currentUser?.photoURL     || null;
    console.log("📱 Profilo caricato da Firestore:", { uid, username, pfpUrl, hasUsername: !!data.username, hasPfp: !!data.pfp });
    applyUserUI(username, pfpUrl);
  } catch (e) {
    console.error("❌ Errore profilo:", e);
    applyUserUI(currentUser?.displayName || "Utente", null);
  }
}

function applyUserUI(username, pfpUrl) {
  const greetEl = document.getElementById("hero-greeting");
  if (greetEl) greetEl.textContent = `Ciao, ${username}`;

  const nameEl = document.getElementById("user-name-sidebar");
  if (nameEl) nameEl.textContent = username;

  const initial = username.charAt(0).toUpperCase();

  ["user-pfp-sidebar", "user-pfp-topbar"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (pfpUrl) {
      el.innerHTML = `<img src="${pfpUrl}" alt="${username}"
        style="width:100%;height:100%;object-fit:cover;border-radius:50%"
        onerror="this.parentElement.textContent='${initial}'">`;
    } else {
      el.textContent = initial;
    }
  });
}

// ─────────────────────────────────────────────
// FIRESTORE BOOTSTRAP
// ─────────────────────────────────────────────

async function ensureAiDocuments(uid) {
  const now = serverTimestamp();
  await Promise.all([
    setDoc(doc(db, "users", uid, "ai", "meta"),  { createdAt: now, updatedAt: now }, { merge: true }),
    // FIX BUG 1: serve anche il doc "data" come intermedio per chatHistoryColRef
    setDoc(doc(db, "users", uid, "ai", "data"),  { createdAt: now }, { merge: true }),
    setDoc(contextMemoryDocRef(uid),             { note: "", facts: [], updatedAt: now }, { merge: true }),
    setDoc(personalizationDocRef(uid),           { aiStyle: "normal", aiTone: "balanced", updatedAt: now }, { merge: true }),
    setDoc(preferencesDocRef(uid),               { language: "it", responseMode: "balanced", updatedAt: now }, { merge: true })
  ]);
}

async function loadUserMemory(uid) {
  const [ctxSnap, persSnap, prefSnap] = await Promise.all([
    getDoc(contextMemoryDocRef(uid)),
    getDoc(personalizationDocRef(uid)),
    getDoc(preferencesDocRef(uid))
  ]);

  const ctx  = ctxSnap.exists()  ? ctxSnap.data()  : {};
  const pers = persSnap.exists() ? persSnap.data() : {};
  const pref = prefSnap.exists() ? prefSnap.data() : {};

  userMemory = {
    contextMemory:   { facts: Array.isArray(ctx.facts) ? ctx.facts.slice(0, 30) : [], note: ctx.note || "" },
    personalization: { aiStyle: pers.aiStyle || "normal", aiTone: pers.aiTone || "balanced" },
    preferences:     { language: pref.language || "it", responseMode: pref.responseMode || "balanced" }
  };

  currentSettings = {
    aiStyle:    userMemory.personalization.aiStyle,
    aiTone:     userMemory.personalization.aiTone,
    memoryNote: userMemory.contextMemory.note
  };

  hydrateSettingsForm();
}

function hydrateSettingsForm() {
  const byId = id => document.getElementById(id);
  if (byId("ai-style"))    byId("ai-style").value    = currentSettings.aiStyle;
  if (byId("ai-tone"))     byId("ai-tone").value     = currentSettings.aiTone;
  if (byId("memory-note")) byId("memory-note").value = currentSettings.memoryNote;
}

// ─────────────────────────────────────────────
// CHAT MANAGEMENT
// ─────────────────────────────────────────────

async function createChat(initialTitle = "Nuova chat") {
  if (!currentUser) return null;

  const now = Date.now();
  chatCreationTimestamps = chatCreationTimestamps.filter(t => now - t < 30000);
  if (chatCreationTimestamps.length >= 3) {
    console.warn("Anti-spam: troppe chat create di recente.");
    return null;
  }

  const chatRef = await addDoc(chatsColRef(currentUser.uid), {
    title:         sanitizeTitle(initialTitle),
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp(),
    lastMessage:   "",
    lastMessageAt: getCurrentIsoDate()
  });

  chatCreationTimestamps.push(now);
  return chatRef.id;
}

async function createNewChatFlow() {
  const chatId = await createChat("Nuova chat");
  if (!chatId) return;
  activeChatId      = chatId;
  activeChatHistory = [];
  clearChatWindow();
  showHero();
  await loadChats();
}

window.createNewChat = async () => createNewChatFlow();

async function loadChats() {
  if (!currentUser) return;
  const historyList = document.getElementById("history-list");
  if (!historyList) return;
  historyList.innerHTML = "";

  try {
    const q    = query(chatsColRef(currentUser.uid), orderBy("updatedAt", "desc"), limit(50));
    const snap = await getDocs(q);

    if (snap.empty) {
      historyList.innerHTML = `<div style="padding:8px 12px;font-size:13px;color:var(--text3)">Nessuna chat</div>`;
      return;
    }

    snap.forEach(chat => {
      const data = chat.data();
      const btn  = document.createElement("button");
      btn.className = "history-item";
      btn.title     = sanitizeTitle(data.title);

      btn.innerHTML = `
        <span class="nav-icon" style="font-size:16px;flex-shrink:0;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
        </span>
        <span class="history-item-text">${sanitizeTitle(data.title).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>
      `;

      if (chat.id === activeChatId) btn.classList.add("active");

      btn.onclick = async () => {
        if (activeChatId === chat.id) return;
        activeChatId = chat.id;
        await loadChatMessages(chat.id);
        await loadChats();
        if (window.innerWidth <= 768) closeSidebar();
      };

      historyList.appendChild(btn);
    });
  } catch (e) {
    console.error("Errore loadChats:", e);
  }
}

async function loadChatMessages(chatId) {
  if (!currentUser || !chatId) return;
  clearChatWindow();
  hideHero();

  try {
    const q    = query(messagesColRef(currentUser.uid, chatId), orderBy("timestamp", "asc"), limit(150));
    const snap = await getDocs(q);
    activeChatHistory = [];

    if (snap.empty) {
      appendMessage("assistant", "Chat pronta. Scrivi il primo messaggio.");
      return;
    }

    snap.forEach(msgDoc => {
      const msg  = msgDoc.data();
      const role = msg.role === "user" ? "user" : "assistant";
      appendMessage(role, msg.content || "");
      activeChatHistory.push({
        role: msg.role === "user" ? "user" : "model",
        text: msg.content || ""
      });
    });

    if (activeChatHistory.length > 40) {
      activeChatHistory = activeChatHistory.slice(-40);
    }

    scrollToBottom();
  } catch (e) {
    console.error("Errore loadChatMessages:", e);
  }
}

async function appendMessageToFirestore(chatId, role, content) {
  if (!currentUser || !chatId) return;
  await addDoc(messagesColRef(currentUser.uid, chatId), {
    role, content, timestamp: serverTimestamp()
  });
}

async function updateChatMetadata(chatId, payload = {}) {
  if (!currentUser || !chatId) return;
  await setDoc(chatDocRef(currentUser.uid, chatId), { updatedAt: serverTimestamp(), ...payload }, { merge: true });
}

async function updatePersistentMemory(userMessage, aiMessage) {
  if (!currentUser) return;

  const extractedFacts = extractMemoryFacts(userMessage);
  const uniqueFacts    = [...new Set([...extractedFacts, ...(userMemory.contextMemory.facts || [])])].slice(0, 30);
  userMemory.contextMemory.facts = uniqueFacts;

  await Promise.all([
    setDoc(contextMemoryDocRef(currentUser.uid), {
      note:      currentSettings.memoryNote || "",
      facts:     uniqueFacts,
      updatedAt: serverTimestamp()
    }, { merge: true }),

    // FIX BUG 1: chatHistoryColRef ora punta a path valido con 5 segmenti
    addDoc(chatHistoryColRef(currentUser.uid), {
      chatId:    activeChatId,
      timestamp: getCurrentIsoDate(),
      user:      sanitizeTitle(userMessage),
      assistant: sanitizeTitle(aiMessage)
    })
  ]);
}

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────

function showHero() {
  document.getElementById("hero")?.classList.remove("hidden");
  document.getElementById("chat-view")?.classList.remove("visible");
}

function hideHero() {
  document.getElementById("hero")?.classList.add("hidden");
  document.getElementById("chat-view")?.classList.add("visible");
}

function clearChatWindow() {
  const c = document.getElementById("chat-container");
  if (c) c.innerHTML = "";
}

function scrollToBottom() {
  const c = document.getElementById("chat-container");
  if (c) c.scrollTop = c.scrollHeight;
}

function appendMessage(role, text) {
  const container = document.getElementById("chat-container");
  if (!container) return null;

  const isAI = role === "assistant" || role === "ai";

  const wrapper = document.createElement("div");
  wrapper.className = `msg-wrapper ${isAI ? "ai-wrapper" : "user-wrapper"}`;

  if (isAI) {
    const avatar = document.createElement("div");
    avatar.className   = "ai-avatar";
    avatar.textContent = "📚";
    wrapper.appendChild(avatar);
  }

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  if (isAI && typeof window.marked !== "undefined") {
    bubble.innerHTML = window.marked.parse(text);
  } else {
    bubble.textContent = text;
  }

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function showTyping() {
  const container = document.getElementById("chat-container");
  if (!container) return;
  const w = document.createElement("div");
  w.className = "msg-wrapper ai-wrapper";
  w.id = "__typing__";
  w.innerHTML = `<div class="ai-avatar">📚</div>
    <div class="typing-indicator"><span></span><span></span><span></span></div>`;
  container.appendChild(w);
  scrollToBottom();
}

function removeTyping() { document.getElementById("__typing__")?.remove(); }

function autoResize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
}

// ─────────────────────────────────────────────
// SEND LOGIC
// ─────────────────────────────────────────────

async function sendMessage(message) {
  if (!currentUser || !message.trim() || isSending) return;

  if (!activeChatId) {
    activeChatId = await createChat(message);
    if (!activeChatId) return;
  }

  isSending = true;
  hideHero();
  appendMessage("user", message);
  showTyping();

  const selectedModel = "gemini-3.1-flash-lite-preview";
  const controller    = new AbortController();
  const timerId       = setTimeout(() => controller.abort(), 20000);
  const taggedMessage = "[SCHOOL_MODE]\n" + message;

  // FIX BUG 2: salva subito il messaggio utente su Firestore
  await appendMessageToFirestore(activeChatId, "user", message);

  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        chatId:             activeChatId,
        message:            taggedMessage,
        uid:                currentUser.uid,
        history:            activeChatHistory.slice(-40),
        settings:           currentSettings,
        memory:             userMemory,
        systemMemoryPrompt: buildSystemMemoryPrompt(),
        model:              selectedModel
      })
    });

    clearTimeout(timerId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Errore HTTP ${response.status}`);
    }

    const data       = await response.json();
    const aiResponse = data.reply || "Errore AI";

    let safeResponse = aiResponse;

    if (/risultato\s*[:=]|soluzione\s*[:=]|=|\bfinale\b|\bquindi\b/i.test(aiResponse)) {
      safeResponse = "Proviamo insieme 🙂 Ti guido passo passo.";
    }

    removeTyping();
    appendMessage("assistant", safeResponse);

    activeChatHistory.push({ role: "user",  text: message      });
    activeChatHistory.push({ role: "model", text: safeResponse });

    await appendMessageToFirestore(activeChatId, "assistant", safeResponse);
    await updateChatMetadata(activeChatId, { lastMessage: safeResponse });
    await updatePersistentMemory(message, safeResponse);
    await loadChats();

  } catch (err) {
    removeTyping();
    clearTimeout(timerId);

    let msg = "Errore di connessione.";
    if (err.name === "AbortError")                        msg = "Il server ha impiegato troppo tempo.";
    else if (err.message.includes("Gemini API error"))    msg = "Errore dalle API di Google.";

    appendMessage("assistant", msg);
    console.error("Errore:", err);
  } finally {
    isSending = false;
  }
}

// ─────────────────────────────────────────────
// GLOBAL WINDOW HANDLERS
// ─────────────────────────────────────────────

window.handleSend = async function () {
  const input   = document.getElementById("user-input");
  const message = input?.value.trim() || "";
  if (!message) return;
  input.value = "";
  autoResize(input);
  document.getElementById("send-btn")?.classList.remove("active");
  await sendMessage(message);
};

window.handleChatSend = async function () {
  const input   = document.getElementById("chat-input");
  const message = input?.value.trim() || "";
  if (!message) return;
  input.value = "";
  autoResize(input);
  await sendMessage(message);
};

window.setPrompt = function (text) {
  const input = document.getElementById("user-input");
  if (!input) return;
  input.value = text;
  autoResize(input);
  document.getElementById("send-btn")?.classList.add("active");
  input.focus();
};

window.newChat = async function () { await createNewChatFlow(); };

window.toggleSidebar = function () {
  document.getElementById("sidebar")?.classList.toggle("expanded");
  document.getElementById("sidebar-overlay")?.classList.toggle("open");
};
window.closeSidebar = function () {
  document.getElementById("sidebar")?.classList.remove("expanded");
  document.getElementById("sidebar-overlay")?.classList.remove("open");
};

window.openSettings = async function () {
  if (currentUser) await loadUserMemory(currentUser.uid);
  document.getElementById("settings-modal")?.classList.add("open");
};
window.closeSettings = function () {
  document.getElementById("settings-modal")?.classList.remove("open");
};

window.saveSettings = async function () {
  if (!currentUser) return;
  const aiStyle    = document.getElementById("ai-style")?.value    || "normal";
  const aiTone     = document.getElementById("ai-tone")?.value     || "balanced";
  const memoryNote = document.getElementById("memory-note")?.value || "";

  await Promise.all([
    setDoc(personalizationDocRef(currentUser.uid), { aiStyle, aiTone, updatedAt: serverTimestamp() }, { merge: true }),
    setDoc(contextMemoryDocRef(currentUser.uid),   { note: memoryNote, updatedAt: serverTimestamp() }, { merge: true })
  ]);

  currentSettings = { aiStyle, aiTone, memoryNote };
  userMemory.personalization    = { aiStyle, aiTone };
  userMemory.contextMemory.note = memoryNote;
  closeSettings();
};

window.deleteAllChats = async function () {
  if (!confirm("Eliminare tutte le chat?")) return;
  await createNewChatFlow();
  closeSettings();
};

window.logout = async function () {
  await signOut(auth);
  window.location.href = "login.html";
};

// ─────────────────────────────────────────────
// KEYBOARD & INPUT LISTENERS
// ─────────────────────────────────────────────

document.addEventListener("keydown", e => {
  if (e.key === "Escape") window.closeSettings();
  if (e.key === "Enter" && !e.shiftKey) {
    if (document.activeElement?.id === "user-input") { e.preventDefault(); window.handleSend(); }
    if (document.activeElement?.id === "chat-input") { e.preventDefault(); window.handleChatSend(); }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const userInput = document.getElementById("user-input");
  const chatInput = document.getElementById("chat-input");
  const sendBtn   = document.getElementById("send-btn");

  userInput?.addEventListener("input", () => {
    autoResize(userInput);
    sendBtn?.classList.toggle("active", userInput.value.trim().length > 0);
  });

  chatInput?.addEventListener("input", () => autoResize(chatInput));

  if (window.innerWidth <= 768) {
    document.querySelector(".topbar-hamburger")?.style.setProperty("display", "flex");
  }
});

// ─────────────────────────────────────────────
// AUTH STATE
// ─────────────────────────────────────────────

onAuthStateChanged(auth, async user => {
  if (!user) {
    console.log("❌ Utente non loggato - reindirizzamento a login...");
    await redirectByAvailability();
    return;
  }

  console.log("✅ Utente loggato:", { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL });

  currentUser = user;

  await ensureAiDocuments(user.uid);
  await Promise.all([
    loadUserMemory(user.uid),
    loadUserProfile(user.uid)
  ]);
  await loadChats();

  try {
    const snap = await getDocs(query(chatsColRef(user.uid), orderBy("updatedAt", "desc"), limit(1)));
    if (!snap.empty) {
      activeChatId = snap.docs[0].id;
      await loadChatMessages(activeChatId);
      await loadChats();
      return;
    }
  } catch (e) {
    console.error("Errore caricamento ultima chat:", e);
  }

  await createNewChatFlow();
});